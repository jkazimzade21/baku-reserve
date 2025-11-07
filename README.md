  # baku-reserve-clean

  This repo contains the FastAPI backend, Expo mobile client, and asset scripts
  for the Baku Reserve demo.
  Key commands:

  ## Backend
  ```bash
  ./scripts/dev_backend.sh        # sets up .venv, installs deps, runs uvicorn
  python3 scripts/update_photos_from_shortcodes.py   # refresh Instagram photo
  URLs

  ## Mobile

  cd mobile
  npm install
  ./scripts/dev_mobile.sh -- --clear   # launches Expo pointing at the backend
  npm run test    # Jest suite

  ## Asset Helpers

  - scripts/update_instagram_photos.py: downloads JPEGs to igpics/<slug>/1-5.jpg
  - scripts/build_demo_photos.py: converts those JPEGs to WebP and regenerates
    the mobile manifest

  All generated artifacts (node_modules, __pycache__, etc.) are ignored
  via .gitignore.
  EOF


