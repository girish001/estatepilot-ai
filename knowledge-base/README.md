# Property Knowledge Base

Place property brochures, PDFs, price sheets, layouts, approval documents, amenity lists, FAQs, and other approved property material in the matching category folder:

- `Plots/`
- `House/`
- `Flats/`

## How EstatePilot AI should use these files

Documents are source material, not automatically trusted facts. Before a document can be used in a customer call, the ingestion workflow must:

1. Detect the file type and extract text, tables, and relevant metadata (including OCR for scanned PDFs).
2. Record the filename, category, project/property, upload date, document version, and uploader.
3. Extract structured facts such as location, property type, area, approved rate per square foot, amenities, availability, RERA/approval references, and contact details.
4. Flag conflicting, missing, expired, or ambiguous information for human review.
5. Require an authorized reviewer to approve extracted facts before publishing them to the AI knowledge base.
6. Index approved content for retrieval, retaining citations back to the source file and page/section where possible.
7. Re-index and invalidate superseded content when a newer approved document is uploaded.

## Calling-time guardrails

- The AI may answer only from approved, current knowledge-base content and verified inventory records.
- It must not invent facts or treat unreviewed uploads as confirmed information.
- Quote only the approved rate per square foot (or approved unit rate where square-foot pricing does not apply).
- Never ask for or store the customer's total budget.
- Never negotiate, promise discounts, or quote an unapproved final price. Refer negotiation to a one-to-one meeting with a sales executive.
- If the answer is missing, stale, conflicting, or not approved, tell the customer that a property executive will confirm it.
- Keep a traceable source reference for each factual answer.

## Upload guidance

Use descriptive filenames, for example:

- `Green-County-Plot-Brochure-2026-11.pdf`
- `Sunrise-Villas-Approved-Rate-Card-2026-11.xlsx`
- `ABC-Flats-Amenities-and-Floor-Plans.pdf`

Do not upload customer personal data, passwords, API keys, or confidential documents that the AI is not authorized to disclose. Large files may be better stored in private object storage with a secure document reference rather than committed to Git.
