/* hearth-weather-card
 * A quiet, typography-first weather card for dark glass dashboards.
 * Current conditions + 12-hour temperature curve + daily low/high range bars.
 * No dependencies, no icons, no build step.
 */

const VERSION = "0.2.0";

class HearthWeatherCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._hourly = null;
    this._daily = null;
    this._unsubs = [];
    this._hass = null;
  }

  setConfig(config) {
    if (!config.entity) throw new Error("hearth-weather-card: 'entity' (weather.*) is required");
    this._config = {
      hours: 12,
      days: 4,
      accent: "#FFB27A",
      ...config,
    };
    this._render();
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (first) this._subscribe();
    this._render();
  }

  connectedCallback() {
    if (this._hass && this._unsubs.length === 0) this._subscribe();
  }

  disconnectedCallback() {
    this._unsubscribe();
  }

  async _subscribe() {
    if (!this._hass || !this._config) return;
    this._unsubscribe();
    const sub = (type, cb) =>
      this._hass.connection.subscribeMessage(cb, {
        type: "weather/subscribe_forecast",
        entity_id: this._config.entity,
        forecast_type: type,
      });
    try {
      this._unsubs.push(await sub("hourly", (e) => { this._hourly = e.forecast; this._render(); }));
      this._unsubs.push(await sub("daily", (e) => { this._daily = e.forecast; this._render(); }));
    } catch (err) {
      console.error("hearth-weather-card: forecast subscription failed", err);
    }
  }

  _unsubscribe() {
    this._unsubs.forEach((u) => { try { u(); } catch (_) {} });
    this._unsubs = [];
  }

  getCardSize() { return 6; }

  static getStubConfig(hass) {
    const entity = Object.keys(hass.states).find((e) => e.startsWith("weather.")) || "weather.home";
    return { entity };
  }

  _condLabel(state) {
    const map = {
      "clear-night": "Clear", cloudy: "Cloudy", exceptional: "Severe", fog: "Fog",
      hail: "Hail", lightning: "Thunderstorms", "lightning-rainy": "Thunderstorms",
      partlycloudy: "Partly cloudy", pouring: "Heavy rain", rainy: "Rain",
      snowy: "Snow", "snowy-rainy": "Sleet", sunny: "Sunny", windy: "Windy",
      "windy-variant": "Windy",
    };
    return map[state] || (state ? state.charAt(0).toUpperCase() + state.slice(1) : "—");
  }

  _hourLabel(date) {
    return date.toLocaleTimeString([], { hour: "numeric" }).replace(":00", "").replace(/\s/, " ");
  }

  // Smooth path through points via Catmull-Rom -> cubic Bezier
  _smoothPath(pts) {
    if (pts.length < 2) return "";
    let d = `M${pts[0][0]},${pts[0][1]}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1],
            p3 = pts[Math.min(pts.length - 1, i + 2)];
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += `C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
    }
    return d;
  }

  _render() {
    if (!this._config || !this._hass) return;
    const stateObj = this._hass.states[this._config.entity];
    const accent = this._config.accent;
    if (!stateObj) {
      this.shadowRoot.innerHTML = `<div style="color:#f88;padding:16px;">hearth-weather-card: entity ${this._config.entity} not found</div>`;
      return;
    }

    const attrs = stateObj.attributes;
    const curTemp = this._config.temperature_sensor && this._hass.states[this._config.temperature_sensor]
      ? Number(this._hass.states[this._config.temperature_sensor].state)
      : attrs.temperature;
    const cond = this._condLabel(stateObj.state);
    const humidity = this._config.humidity_sensor && this._hass.states[this._config.humidity_sensor]
      ? Number(this._hass.states[this._config.humidity_sensor].state)
      : attrs.humidity;

    // ---- today's H/L from daily forecast
    const daily = this._daily || [];
    const today = daily[0];
    const hl = today
      ? `H ${Math.round(today.temperature)}° · L ${Math.round(today.templow ?? today.temperature)}°`
      : "";

    // ---- hourly curve
    const W = 440, H = 120, PT = 24, PB = 6;
    const hourly = (this._hourly || []).slice(0, this._config.hours + 1);
    let curveSvg = "", hourLabels = "";
    if (hourly.length >= 2) {
      const temps = hourly.map((f) => f.temperature);
      let min = Math.min(...temps), max = Math.max(...temps);
      if (max - min < 4) { const mid = (max + min) / 2; min = mid - 2; max = mid + 2; }
      const x = (i) => (i / (hourly.length - 1)) * W;
      const y = (t) => PT + (1 - (t - min) / (max - min)) * (H - PT - PB);
      const pts = temps.map((t, i) => [x(i), y(t)]);
      const line = this._smoothPath(pts);
      const area = `${line}L${W},${H}L0,${H}Z`;

      // peak annotation
      let pi = 0;
      temps.forEach((t, i) => { if (t > temps[pi]) pi = i; });
      const peakDate = new Date(hourly[pi].datetime);
      const peakLabel = pi > 0
        ? `<text x="${Math.min(x(pi), W - 120)}" y="12" fill="rgba(255,255,255,0.4)" font-size="14">peak ${Math.round(temps[pi])}° · ${this._hourLabel(peakDate)}</text>`
        : "";

      // now marker = first point
      const [nx, ny] = pts[0];
      const nowTemp = Math.round(curTemp ?? temps[0]);
      const marker = `
        <circle cx="${nx + 6}" cy="${ny}" r="6" fill="${accent}"/>
        <circle cx="${nx + 6}" cy="${ny}" r="11" fill="none" stroke="${accent}66" stroke-width="2"/>
        <text x="${nx}" y="${ny - 16}" fill="${accent}" font-size="16" font-weight="600">${nowTemp}°</text>`;

      curveSvg = `
        <svg class="curve" width="100%" height="${H}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
          <defs>
            <linearGradient id="hwfade" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="${accent}24"/>
              <stop offset="100%" stop-color="${accent}00"/>
            </linearGradient>
          </defs>
          <path d="${area}" fill="url(#hwfade)"/>
          <path d="${line}" fill="none" stroke="rgba(255,255,255,0.55)" stroke-width="2.5"/>
          ${peakLabel}${marker}
        </svg>`;

      const stepH = Math.max(1, Math.round((hourly.length - 1) / 4));
      const labels = [];
      for (let i = 0; i < hourly.length; i += stepH) {
        labels.push(`<span>${this._hourLabel(new Date(hourly[i].datetime))}</span>`);
      }
      hourLabels = `<div class="hours">${labels.join("")}</div>`;
    }

    // ---- daily range bars (skip today)
    const todayStr = new Date().toDateString();
    const future = daily.filter((f) => new Date(f.datetime).toDateString() !== todayStr).slice(0, this._config.days);
    let rows = "";
    if (future.length) {
      const his = future.map((f) => f.temperature);
      const los = future.map((f) => f.templow ?? f.temperature);
      const gmin = Math.min(...los), gmax = Math.max(...his), span = Math.max(1, gmax - gmin);
      rows = future.map((f) => {
        const day = new Date(f.datetime).toLocaleDateString([], { weekday: "short" });
        const lo = Math.round(f.templow ?? f.temperature), hi = Math.round(f.temperature);
        const left = (((f.templow ?? f.temperature) - gmin) / span) * 100;
        const width = ((f.temperature - (f.templow ?? f.temperature)) / span) * 100;
        return `<tr>
          <td class="day">${day}</td>
          <td class="lo">${lo}</td>
          <td class="barcell"><div class="track"><div class="fill" style="left:${left.toFixed(1)}%;width:${Math.max(width, 3).toFixed(1)}%"></div></div></td>
          <td class="hi">${hi}</td>
        </tr>`;
      }).join("");
    }

    this.shadowRoot.innerHTML = `
      <style>
        :host { display:block; color:rgba(255,255,255,0.97);
          font-family: var(--paper-font-body1_-_font-family, Roboto, system-ui, sans-serif); }
        .now { display:flex; align-items:baseline; gap:18px; }
        .temp { font-size:96px; font-weight:300; letter-spacing:-3px; line-height:1; }
        .cond { font-size:25px; color:rgba(255,255,255,0.45); }
        .cond b { color:rgba(255,255,255,0.97); font-weight:500; }
        .sub { font-size:22px; color:rgba(255,255,255,0.55); letter-spacing:1px;
          margin-top:8px; text-transform:uppercase; }
        .sub b { color:rgba(255,255,255,0.97); font-weight:500; }
        .curve { display:block; margin:30px 0 4px; overflow:visible; }
        .hours { display:flex; justify-content:space-between; font-size:15px;
          color:rgba(255,255,255,0.35); letter-spacing:1px; padding:0 2px; }
        .rule { height:1px; background:linear-gradient(90deg, ${accent}80, rgba(255,255,255,0.06)); margin:30px 0 20px; }
        table { border-collapse:collapse; width:100%; }
        td { padding:11px 0; font-size:20px; }
        .day { color:rgba(255,255,255,0.45); font-weight:600; letter-spacing:2px;
          font-size:16px; text-transform:uppercase; width:64px; }
        .lo, .hi { color:rgba(255,255,255,0.45); font-variant-numeric:tabular-nums; width:44px; font-size:19px; }
        .hi { color:rgba(255,255,255,0.97); text-align:right; }
        .barcell { padding:0 14px; }
        .track { position:relative; height:3px; border-radius:2px; background:rgba(255,255,255,0.08); }
        .fill { position:absolute; height:3px; border-radius:2px; background:linear-gradient(90deg,#7d8ba1,${accent}); }
      </style>
      <div class="now">
        <div class="temp">${curTemp != null ? Math.round(curTemp) : "—"}°</div>
        <div>
          <div class="cond"><b>${cond}</b>${hl ? ` · ${hl}` : ""}</div>
          ${humidity != null && !Number.isNaN(humidity) ? `<div class="sub"><b>${Math.round(humidity)}%</b> humidity</div>` : ""}
        </div>
      </div>
      ${curveSvg}${hourLabels}
      ${rows ? `<div class="rule"></div><table>${rows}</table>` : ""}
    `;
  }
}

customElements.define("hearth-weather-card", HearthWeatherCard);
window.customCards = window.customCards || [];
window.customCards.push({
  type: "hearth-weather-card",
  name: "Hearth Weather Card",
  description: "Typography-first weather: current conditions, 12-hour temperature curve, and daily range bars.",
});
console.info(`%c HEARTH-WEATHER-CARD %c v${VERSION} `, "background:#FFB27A;color:#000;font-weight:700;", "background:#222;color:#FFB27A;");
