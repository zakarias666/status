/* status.zbj.dk — widget renderer
   Reads Upptime's history/summary.json (one request drives every widget). */

(function () {
  var CFG = window.STATUS_CONFIG || {};
  var SUMMARY_URL = CFG.summaryUrl;

  // ?theme=light|dark forces a mode; default follows OS via CSS.
  var params = new URLSearchParams(location.search);
  var theme = params.get("theme");
  if (theme === "light" || theme === "dark") {
    document.documentElement.setAttribute("data-theme", theme);
  }

  var STATE = { up: "ok", degraded: "warn", down: "down" };
  function cls(status) { return STATE[status] || "idle"; }
  function label(status) {
    return { ok: "Operational", warn: "Degraded", down: "Down", idle: "No data" }[cls(status)];
  }
  function pct(str) { var n = parseFloat(str); return isNaN(n) ? null : n; }

  // worst status wins for the overall roll-up
  function overall(sites) {
    if (!sites.length) return "idle";
    if (sites.some(function (s) { return s.status === "down"; })) return "down";
    if (sites.some(function (s) { return s.status === "degraded"; })) return "warn";
    return "ok";
  }
  var OVERALL = {
    ok:   { name: "Operational", desc: "All systems normal" },
    warn: { name: "Degraded",    desc: "Some systems slow" },
    down: { name: "Disruption",  desc: "A service is down" },
    idle: { name: "No data",     desc: "Awaiting first check" }
  };

  function meanUptime(sites, key) {
    var vals = sites.map(function (s) { return pct(s[key]); }).filter(function (v) { return v != null; });
    if (!vals.length) return null;
    return vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
  }
  function fmtPct(n) { return n == null ? "—" : n.toFixed(2) + "%"; }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function sparkline(data, statusClass) {
    var w = 74, h = 22, pad = 2;
    var max = Math.max.apply(null, data), min = Math.min.apply(null, data);
    var rng = (max - min) || 1;
    var pts = data.map(function (d, i) {
      var x = pad + i * (w - pad * 2) / (data.length - 1);
      var y = h - pad - (d - min) / rng * (h - pad * 2);
      return [x, y];
    });
    var line = pts.map(function (p) { return p[0].toFixed(1) + "," + p[1].toFixed(1); }).join(" ");
    var area = pad + "," + (h - pad) + " " + line + " " + (w - pad) + "," + (h - pad);
    var end = pts[pts.length - 1];
    var c = "var(--" + (statusClass === "idle" ? "idle" : statusClass) + ")";
    return '<svg class="spark" viewBox="0 0 ' + w + ' ' + h + '" aria-hidden="true">' +
      '<polyline points="' + area + '" fill="' + c + '" opacity="0.10"/>' +
      '<polyline points="' + line + '" fill="none" stroke="' + c + '" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>' +
      '<circle cx="' + end[0].toFixed(1) + '" cy="' + end[1].toFixed(1) + '" r="2" fill="' + c + '"/></svg>';
  }

  function donut(pctValue, statusClass) {
    var r = 68, cx = 80, cy = 80, sw = 13;
    var c = 2 * Math.PI * r;
    var frac = Math.max(0, Math.min(100, pctValue == null ? 0 : pctValue)) / 100;
    var off = c * (1 - frac);
    var col = "var(--" + (statusClass === "idle" ? "idle" : statusClass) + ")";
    var track = "var(--" + (statusClass === "idle" ? "idle" : statusClass) + "-soft)";
    return '<svg class="ring-svg" viewBox="0 0 160 160" width="148" height="148" aria-hidden="true">' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + track + '" stroke-width="' + sw + '"/>' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + col + '" stroke-width="' + sw + '" ' +
      'stroke-linecap="round" stroke-dasharray="' + c.toFixed(2) + '" stroke-dashoffset="' + off.toFixed(2) + '"/></svg>';
  }

  // aggregate dailyMinutesDown across all sites into 30 day-cells (oldest→today)
  function dayCells(sites, days) {
    var today = new Date();
    var cells = [];
    for (var i = days - 1; i >= 0; i--) {
      var d = new Date(today);
      d.setDate(today.getDate() - i);
      var key = d.toISOString().slice(0, 10);
      var mins = 0;
      sites.forEach(function (s) {
        if (s.dailyMinutesDown && s.dailyMinutesDown[key]) mins += s.dailyMinutesDown[key];
      });
      var c = mins === 0 ? "" : (mins >= 30 ? "d" : "w");
      cells.push('<i class="' + c + '"></i>');
    }
    return '<div class="bars">' + cells.join("") + "</div>";
  }

  function banner(o, bigVal, bigLbl) {
    var m = OVERALL[o];
    return '<div class="banner s-' + o + '"><span class="dot"></span>' +
      '<div class="banner-txt"><h1>' + m.name + "</h1><p>" + m.desc + "</p></div>" +
      '<div class="metric"><div class="big">' + bigVal + '</div><div class="lbl">' + bigLbl + "</div></div></div>";
  }

  function serviceRows(sites, mode) {
    var rows = sites.map(function (s) {
      var c = cls(s.status);
      var right;
      if (mode === "response") {
        var series = [s.timeYear, s.timeMonth, s.timeWeek, s.timeDay, s.time].filter(function (v) { return typeof v === "number"; });
        var spark = series.length >= 2 ? sparkline(series, c) : "";
        right = spark + '<span class="mono"><b>' + (s.time != null ? s.time : "—") + "</b> ms</span>";
      } else {
        right = '<span class="mono">' + fmtPct(pct(s.uptimeMonth)) + '</span>' +
          '<span class="pill s-' + c + '">' + label(s.status) + "</span>";
      }
      return '<div class="row s-' + c + '"><span class="dot"></span>' +
        '<span class="name">' + esc(s.name) + '</span>' +
        '<span class="right">' + right + "</span></div>";
    }).join("");
    return '<div class="rows">' + rows + "</div>";
  }

  function render(widget, sites) {
    var o = overall(sites);
    if (widget === "overview") {
      return banner(o, fmtPct(meanUptime(sites, "uptimeMonth")), "30-day uptime") +
        '<div class="hr"></div>' + serviceRows(sites, "status");
    }
    if (widget === "services") {
      return serviceRows(sites, "status");
    }
    if (widget === "response") {
      return serviceRows(sites, "response");
    }
    if (widget === "gauge") {
      var mean = meanUptime(sites, "uptimeMonth");
      var up = sites.filter(function (s) { return s.status === "up"; }).length;
      var m = OVERALL[o];
      return '<div class="gauge"><div class="ring s-' + o + '">' + donut(mean, o) +
        '<div class="center"><div class="pctval">' + (mean == null ? "—" : Math.round(mean) + "%") +
        '</div><div class="pctlbl">30-day uptime</div></div></div>' +
        '<div class="sub s-' + o + '"><span class="dot"></span>' +
        '<span class="subname">' + m.name + '</span>' +
        '<span class="mono"><b>' + up + "</b>/" + sites.length + "</span></div></div>";
    }
    if (widget === "uptime") {
      return banner(o, fmtPct(meanUptime(sites, "uptimeMonth")), "uptime") +
        '<div style="height:12px"></div>' + dayCells(sites, 30) +
        '<div class="axis"><span>30d ago</span><span>today</span></div>';
    }
    return "";
  }

  var root = document.getElementById("widget");
  var widget = root.getAttribute("data-widget");

  function load() {
    if (!SUMMARY_URL) { root.innerHTML = '<div class="err">Not configured.</div>'; return; }
    fetch(SUMMARY_URL + (SUMMARY_URL.indexOf("?") < 0 ? "?" : "&") + "t=" + Date.now(), { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (sites) {
        if (!Array.isArray(sites)) throw new Error("bad data");
        root.innerHTML = render(widget, sites);
      })
      .catch(function () {
        if (!root.dataset.loaded) root.innerHTML = '<div class="err">Couldn’t reach status data.</div>';
      })
      .then(function () { root.dataset.loaded = "1"; });
  }

  load();
  setInterval(load, 60000);
})();
