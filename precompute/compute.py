import json
import numpy as np
from skyfield.api import load, PlanetaryConstants
from sites import SITES

ts = load.timescale()
eph = load('de421.bsp')
sun, earth, moon = eph['sun'], eph['earth'], eph['moon']

pc = PlanetaryConstants()
pc.read_text(load('moon_080317.tf'))
pc.read_text(load('pck00008.tpc'))
pc.read_binary(load('moon_pa_de421_1900-2050.bpc'))
frame = pc.build_frame_named('MOON_ME_DE421')

# Full year 2027, hourly steps
t = ts.utc(2027, 1, 1, range(0, 24 * 365))


def direction(body):
    """Unit vector from the Moon's center to a body, in the Moon-fixed frame."""
    x, y, z = moon.at(t).observe(body).frame_xyz(frame).au
    v = np.vstack([x, y, z])
    v = v / np.linalg.norm(v, axis=0)
    return {k: np.round(v[i], 4).tolist() for i, k in enumerate("xyz")}


out = {
    "times": [x.strftime("%Y-%m-%dT%H:%M:%SZ") for x in t.utc_datetime()],
    "sun_dir": direction(sun),
    "earth_dir": direction(earth),
    "sites": {},
}

for name, s in SITES.items():
    place = moon + pc.build_latlon_degrees(frame, s["lat"], s["lon"])
    sun_alt, sun_az, _ = place.at(t).observe(sun).apparent().altaz()
    earth_alt, earth_az, _ = place.at(t).observe(earth).apparent().altaz()

    out["sites"][name] = {
        "lat": s["lat"],
        "lon": s["lon"],
        "sun_alt": np.round(sun_alt.degrees, 2).tolist(),
        "sun_az": np.round(sun_az.degrees, 2).tolist(),
        "earth_alt": np.round(earth_alt.degrees, 2).tolist(),
        "earth_az": np.round(earth_az.degrees, 2).tolist(),
    }
    print("done:", name)

with open('../web/data/positions.json', 'w') as f:
    json.dump(out, f)
print("positions.json created")