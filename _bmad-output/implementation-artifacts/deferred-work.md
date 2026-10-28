- source_spec: `/Users/imrane/Desktop/Code/vinted-seller/_bmad-output/implementation-artifacts/spec-cash-express-quote-parser.md`
  summary: Correlate Cash Express estimates safely when add-to-cart does not reveal its basket-line ID.
  evidence: The existing single-item fallback can touch a pre-existing user basket line, while a multi-item basket cannot safely identify the new line without a before/after snapshot or explicit response ID.
- source_spec: `/Users/imrane/Desktop/Code/vinted-seller/_bmad-output/implementation-artifacts/spec-cash-express-quote-parser.md`
  summary: Restrict Cash Express response-ID extraction to confirmed basket-line identifiers.
  evidence: `basketIds()` accepts broad product-like keys; an observed add-to-cart response containing both a catalogue and basket ID is needed to prove and correct the ambiguity.
