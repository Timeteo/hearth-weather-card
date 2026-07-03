# hearth-weather-card

A quiet, typography-first weather card for Home Assistant dark dashboards. No icons, no clip art — a large current temperature, a smooth 12-hour temperature curve with a "now" marker and peak annotation, and daily low/high range bars on a shared scale.

Designed for wall-mounted hubs and kiosks. Zero dependencies, no build step, safe on old WebViews (no `backdrop-filter`, plain SVG).

## Install

### HACS (custom repository)
1. HACS → Custom repositories → add this repo, category **Dashboard**.
2. Install **Hearth Weather Card**.

### Manual
1. Copy `dist/hearth-weather-card.js` to `/config/www/`.
2. Add a dashboard resource: `/local/hearth-weather-card.js`, type **module**.

## Usage

```yaml
type: custom:hearth-weather-card
entity: weather.home
```

## Options

| Option | Default | Description |
|---|---|---|
| `entity` | *required* | A `weather.*` entity that supports hourly and daily forecasts |
| `temperature_sensor` | — | Optional sensor to use for the big "current" number instead of the weather entity's temperature |
| `hours` | `12` | Hours shown in the temperature curve |
| `days` | `4` | Future days shown as range bars (today is the curve, so it's skipped) |
| `accent` | `#FFB27A` | Accent color for the now-marker, gradient fill, and rule |

The card is intentionally transparent — it has no background so it floats on your theme. Wrap it or `card_mod` it if you want a surface behind it.

## License

MIT
