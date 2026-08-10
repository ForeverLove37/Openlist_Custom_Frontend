# Remote Android release builder

The builder service runs on the dedicated Android build host. It keeps every APK in one directory, publishes a JSON index, and invokes the Android toolchain container for each full build. The service is intentionally bound to loopback; Nginx exposes the read-only release API and the authenticated admin API.

The main OpenList Drive BFF calls this service with `ANDROID_BUILD_SERVICE_URL` and `ANDROID_BUILD_SERVICE_TOKEN`. Do not expose the token to the browser.

## Runtime layout

- `/var/lib/openlist-drive/android/releases` contains every generated APK and `releases.json`.
- `/var/lib/openlist-drive/android/config` contains the signing keystore, signing environment, and optional uploaded icon.
- `/var/lib/openlist-drive/android/work` contains temporary per-job source and output files.
- `/var/lib/openlist-drive/android/gradle-cache` keeps the remote Gradle cache between builds.

The default Compose configuration downloads `main` from `SOURCE_REPO` for every build. Set `SOURCE_REF` to change the default branch. `SOURCE_ROOT` remains supported by the service for controlled offline deployments, but it should not be set when the administration panel must build the latest repository source.

Build both service images and start the builder on the dedicated host:

```bash
docker build -f toolchain.Dockerfile -t openlist-drive-android-toolchain:latest .
docker compose build builder
docker compose up -d builder
curl --fail http://127.0.0.1:8091/healthz
```

The builder mounts the Docker socket because it launches an isolated toolchain container for each job. Keep port `8091` bound to loopback, protect `/api/admin/` with `ANDROID_BUILD_SERVICE_TOKEN`, and expose only the supplied Nginx virtual host over HTTPS. Back up the signing keystore and its passwords; losing them prevents compatible upgrades of an installed application.
