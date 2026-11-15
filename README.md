# CLPS Lunar Mission Browser

**Demo video:** [demo.mp4](demo.mp4)

**Team SoloHorizon Tech** (Islamabad local event), 2026 NASA Space Apps Challenge.

A web app that helps mission planners, educators and the public compare Moon south pole landing sites and dates by **Sun** (solar power) and **Earth** (direct-to-Earth communication) visibility.

## Features
- Compare up to five sites and any date range in 2027
- Recommended site, best landing window and best single moment
- Real terrain skyline from NASA LOLA elevation data, with an uncertainty range
- South pole map, 3D Moon, horizon view and timeline
- Window finder: find landing times that meet mission length, darkness and blackout limits
- CSV export

## How it works
1. `precompute/compute.py` uses Skyfield and NASA JPL DE421 to calculate Sun and Earth elevation and azimuth for each site, hour by hour.
2. `precompute/horizons_colab.py` (run in Google Colab) computes the terrain skyline of each site from the NASA LOLA south pole DEM.
3. `web/` is a static page (JavaScript, Plotly, Three.js) that reads the precomputed data.

## Run locally

cd precompute
pip install -r requirements.txt
python compute.py
cd ../web
python -m http.server 8000

Open http://localhost:8000

## Data sources
- NASA JPL DE421 ephemeris and lunar frame kernels (NAIF)
- NASA LRO LOLA south pole DEM, NASA GSFC PGDA product 90. Barker et al. (2023), Planetary Science Journal 4, 183, doi:10.3847/PSJ/acf3e1
- NASA/Goddard SVS CGI Moon Kit (LRO LROC) for the Moon picture
- Site coordinates: NASA LROC region centers

## Limitations
Line-of-sight geometry only (no scattered light or thermal model). Site coordinates are region centers, not exact landing points. The DEM resolution (80 m) limits small nearby features. For planning and education, not for flight operations.