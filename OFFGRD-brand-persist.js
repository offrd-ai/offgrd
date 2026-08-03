/** Single writer for offgrd_brands — always full { abbr, fg, bg, logo }. Load after OFFGRD-config.js. */
(function () {
  function normalizeBrand(name, brand) {
    if (!brand || !brand.bg) return null;
    const nm = String(name || brand.name || "").trim();
    if (!nm) return null;
    return {
      abbr: (brand.abbr && String(brand.abbr).trim()) || "TM",
      fg: brand.fg || "#ffffff",
      bg: brand.bg,
      logo: brand.logo || "",
    };
  }

  /** @returns normalized entry or null if name/bg missing */
  window.OFFGRD_persistBrand = function persistBrand(name, brand) {
    const entry = normalizeBrand(name, brand);
    if (!entry) {
      try {
        console.warn("[brand] persist skipped — missing name or bg", name);
      } catch (e) {}
      return null;
    }
    let cur = {};
    try {
      cur = JSON.parse(localStorage.getItem("offgrd_brands") || "{}") || {};
    } catch (e) {
      cur = {};
    }
    cur[name] = entry;
    localStorage.setItem("offgrd_brands", JSON.stringify(cur));
    localStorage.setItem("offgrd_identity", name);
    try {
      document.documentElement.setAttribute("data-team-hex", entry.bg);
    } catch (e) {}
    return entry;
  };
})();
