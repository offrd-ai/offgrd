# Flag flip — unified + autoderive defaults ON

**Cache:** `?v=48` · config-only (+ override helpers)

## Change
- `OFFGRD_CONFIG.unifiedRender = true`
- `OFFGRD_CONFIG.autoderiveReads = true`
- Query/localStorage `=0` forces off; `=1` forces on (rollback without redeploy).

## Verify
Fresh session, no params: unified + autoderive active.  
`?unified=0` / `?autoderive=0` (or localStorage `0`) restores prior gated behavior.
