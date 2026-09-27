# 34 · Share links, save slots, and comparing two plans

**Phase 1 · Size M · Depends on 04, 10 · Review: yes (security)**

## Why

Hosting is static, so sharing has to work without a server. Today there's one autosave per region and file export/import. Results only subtract the published network, so two of the player's own plans cannot be compared. Do this in whichever layout exists: `app.js` if brief 11 has not landed, `src/` if it has.

## Scope

1. **Encoding:**
   - Take the normalized scenario from brief 04 and include `region` and `networkVersion`.
   - Minify it: map field names to short keys, and replace custom stop ids and geometry with positions only. Geometry is always rebuilt from stops and waypoints.
   - Then serialize as JSON, compress with `CompressionStream('deflate-raw')`, encode as base64url, and put it in `#s=<payload>`.
   - Use `#`, not `?`, so the payload never reaches the server or Cloudflare logs.
   - Warn when the link is over 8,000 characters, and offer file export instead.
2. **Decoding on load:**
   - Decompress, expand, then pass through `TransitScenario.normalize()`. Never skip it.
   - Show a banner: "Shared scenario: [name] · Keep a copy / Close". The user's own autosave is **not overwritten** unless they choose "Keep a copy", which creates a new save slot.
   - A mismatched region redirects to that region. An unknown network version shows a clear message and loads what's valid.
3. **Save slots per region:**
   - Named scenarios in localStorage (`transit-lab:<region>:slots`), with an index holding name, updated time and a small summary (trips and cost).
   - Actions: create, rename, duplicate, delete and switch. Autosave always writes to the active slot.
   - Limit to 30 slots. Show storage use; a localStorage quota error shows a helpful toast.
4. **Compare against a chosen plan.** The Results deltas default to the published network. A control "Compare with" lists the published network and the other save slots. Choosing a slot subtracts that slot's stats. Cache stats on the slot when the player leaves it, and recompute when `modelVersion` or `networkVersion` differs. The published network remains the default. This works before share links do; implement it even if link encoding slips.
5. **Share button** in the top bar and the mobile menu. It copies the link (with the clipboard fallback that already exists) and shows the link length. Optionally show a QR code later; don't add a dependency now. The link includes `daypart` when brief 06 has added it.
6. **Challenge results** (brief 32) include the challenge id, so opening the link shows the challenge with that solution.

## Acceptance checks

- Round trip: the scenario → the link → a fresh browser profile gives identical stats. Add a Node test for encode/decode, using `zlib.deflateRawSync` in place of `CompressionStream`.
- A crafted link with the malicious fixture from brief 04 is sanitized. Nothing executes, and the page makes no requests to the fixture's URLs.
- A typical 2-line player scenario produces a link under 2,000 characters; report the actual length.
- With two save slots, "Compare with" the other slot changes the passenger delta, and "Published network" restores the original delta. Switching slots does not overwrite either save.

## Stop and ask if

- Links for typical scenarios exceed 8,000 characters. Then a tiny backend (short links) would be needed, and that's a hosting decision.
