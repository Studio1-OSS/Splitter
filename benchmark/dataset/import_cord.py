"""Imports 150 real receipt photos from CORD v2 (naver-clova-ix/cord-v2, CC BY 4.0) for the benchmark's
"real receipts" track, with ground truth taken from CORD's human labels.

Deterministic: rows are read in a fixed order (test, validation, then train) and the first 150
usable receipts are kept. A receipt is usable when its labels are unambiguous and add up:
  - at least 2 line items, every line priced, unique line names, no priced sub-items or item discounts;
  - lines + tax + service - discount = printed total.
Who had what is generated (the receipts are real; the note is not), with the same rules as the synthetic set.

    pip install pyarrow pillow
    pnpm bench:import-real        # or python3 benchmark/dataset/import_cord.py; downloads ~1.4 GB of Parquet once, cached in ~/.cache
"""

import io
import json
import re
import subprocess
import sys
from pathlib import Path

import pyarrow.parquet as pq
from PIL import Image

OUT = Path(__file__).resolve().parent / "real"
CACHE = Path.home() / ".cache" / "splitter-benchmark" / "cord-v2"
WANT = 150
BASE = "https://huggingface.co/datasets/naver-clova-ix/cord-v2/resolve/refs%2Fconvert%2Fparquet/default"
SHARDS = [("test", "test/0000.parquet"), ("validation", "validation/0000.parquet"), ("train", "train/0000.parquet"),
          ("train", "train/0001.parquet")]
PEOPLE = ["Aman", "Priya", "Rakesh", "Mahima", "Sam"]

seed = 20261016


def rand():
    global seed
    seed = (seed * 1664525 + 1013904223) % 2**32
    return seed / 2**32


def pick(a):
    return a[int(rand() * len(a))]


def rupiah(v):
    """'Rp. 91,000' / '60.000' / '17500' / '-5.000' -> whole rupiah (IDR has no minor unit in practice)."""
    if v is None or isinstance(v, (dict, list)):
        return None
    s = re.sub(r"rp\.?", "", str(v), flags=re.I).strip()
    negative = s.startswith("-") or "(" in s
    s = re.sub(r"[.,]00$", "", s)
    digits = re.sub(r"\D", "", s)
    if not digits:
        return None
    return (-1 if negative else 1) * int(digits)


def as_list(x):
    return x if isinstance(x, list) else ([x] if x else [])


def parse(gt):
    """Returns (truth, None) for a usable receipt, or (None, skip_reason)."""
    items = []
    for it in as_list(gt.get("menu")):
        if not isinstance(it, dict) or isinstance(it.get("nm"), list) or isinstance(it.get("price"), list):
            return None, "multi-value item"
        if it.get("discountprice") is not None:
            return None, "item discount"
        if any(isinstance(s, dict) and rupiah(s.get("price")) for s in as_list(it.get("sub"))):
            return None, "priced sub-item"
        name = str(it.get("nm") or "").strip()
        price = rupiah(it.get("price", it.get("itemsubtotal")))
        if not name or price is None or price <= 0:
            return None, "unpriced or unnamed line"
        try:
            quantity = max(1, round(float(re.sub(r"[^\d.]", "", str(it.get("cnt", "1"))) or 1)))
        except ValueError:
            quantity = 1
        items.append({"name": name, "quantity": quantity, "totalPrice": price})
    if len(items) < 2:
        return None, "fewer than 2 lines"
    if len({i["name"].lower() for i in items}) != len(items):
        return None, "duplicate line names"

    st = gt.get("sub_total") if isinstance(gt.get("sub_total"), dict) else {}
    t = gt.get("total") if isinstance(gt.get("total"), dict) else {}
    if st.get("etc") is not None or t.get("total_etc") is not None:
        return None, "unlabelled charge"
    tax = rupiah(st.get("tax_price"))
    service = rupiah(st.get("service_price"))
    discount = abs(rupiah(st.get("discount_price")) or 0) if st.get("discount_price") is not None else None
    total = rupiah(t.get("total_price"))
    if total is None or total <= 0:
        return None, "no printed total"

    lines = sum(i["totalPrice"] for i in items)
    if lines + (tax or 0) + (service or 0) - (discount or 0) != total:
        return None, "tax included in prices (ambiguous)" if lines == total else "labels don't add up"
    return {"items": items, "subtotal": lines, "tax": tax, "serviceCharge": service, "tip": None,
            "discount": discount, "total": total, "correctTotal": total}, None


def assign(items, people):
    out = []
    for _ in items:
        r = rand()
        if r < 0.5:
            out.append(list(people))
        elif r < 0.75 and len(people) > 2:
            a = pick(people)
            out.append([a, pick([p for p in people if p != a])])
        else:
            out.append([pick(people)])
    return out


def note(items, assignment, people):
    parts = []
    for it, who in zip(items, assignment):
        if len(who) == len(people):
            parts.append(f"everyone shared the {it['name']}")
        elif len(who) == 2:
            parts.append(f"{who[0]} and {who[1]} shared the {it['name']}")
        else:
            parts.append(f"{who[0]} had the {it['name']}")
    text = ", ".join(parts)
    return text[0].upper() + text[1:] + "."


def shard(rel):
    path = CACHE / rel
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        print(f"Downloading {rel}…", file=sys.stderr)
        subprocess.run(["curl", "-sfL", "--retry", "3", "-o", str(path.with_suffix(".part")), f"{BASE}/{rel}"], check=True)
        path.with_suffix(".part").rename(path)
    return pq.ParquetFile(path)


OUT.mkdir(parents=True, exist_ok=True)
for f in OUT.glob("*.jpg"):
    f.unlink()

kept, skipped, seen = [], {}, {}
for split, rel in SHARDS:
    if len(kept) >= WANT:
        break
    idx = seen.get(split, 0) - 1
    for batch in shard(rel).iter_batches(batch_size=16, columns=["image", "ground_truth"]):
        for row in batch.to_pylist():
            idx += 1
            seen[split] = idx + 1
            if len(kept) >= WANT:
                break
            try:
                gt = json.loads(row["ground_truth"])["gt_parse"]
            except (ValueError, KeyError, TypeError):
                skipped["bad label json"] = skipped.get("bad label json", 0) + 1
                continue
            truth, reason = parse(gt)
            if reason:
                skipped[reason] = skipped.get(reason, 0) + 1
                continue

            rid = f"real-{len(kept) + 1:03d}"
            img = Image.open(io.BytesIO(row["image"]["bytes"])).convert("RGB")
            img.thumbnail((1600, 1600))
            img.save(OUT / f"{rid}.jpg", "JPEG", quality=82, optimize=True)

            people = PEOPLE[: 2 + len(kept) % 4]
            assignment = assign(truth["items"], people)
            kept.append({
                "id": rid,
                "file": f"real/{rid}.jpg",
                "set": "real",
                "source": f"CORD v2 · {split} #{idx}",
                "category": "food",
                "layout": "photo",
                "condition": "real",
                "currency": "IDR",
                "people": people,
                "note": note(truth["items"], assignment, people),
                "planted": False,
                "truth": {"merchant": None, "currency": "IDR", **truth, "assignment": assignment, "date": None},
            })

(OUT / "cases.json").write_text(json.dumps(kept, indent=2, ensure_ascii=False) + "\n")
size = sum(f.stat().st_size for f in OUT.glob("*.jpg"))
print(f"Kept {len(kept)} real receipts ({size / 1e6:.1f} MB of photos, resized to ≤1600 px).")
print("Skipped:", " · ".join(f"{k} {v}" for k, v in sorted(skipped.items(), key=lambda kv: -kv[1])))
