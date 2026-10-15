# Held-out real receipts (CORD v2)

100 photographed receipts from [CORD v2](https://huggingface.co/datasets/naver-clova-ix/cord-v2) (NAVER Clova AI, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)), used to check the real-receipt numbers on receipts that played no part in building the benchmark or writing Splitter's prompt.

- **Chosen the same way as `real/`:** `python3 benchmark/dataset/import_cord.py --holdout` walks CORD in the same fixed order with the same rules, skips the first 150 usable receipts (the real track) and keeps the next 100 (train #218–#515). Nothing was hand-picked or looked at before the run.
- **Ground truth:** CORD's human labels. Who had what is generated, as on the other tracks.
- **Photos:** resized to at most 1,600 px and re-encoded as JPEG. Identifying details were already blurred by the dataset authors.

See [`../real/README.md`](../real/README.md) for the citation.
