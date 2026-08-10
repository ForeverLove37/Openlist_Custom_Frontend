# OpenList Drive Android

This is a small native Android shell around the responsive OpenList Drive web application. It keeps the web and Android experiences on the same API, authentication, previews, uploads, and administration surface while providing native back-button, file-picker, and download handling.

Release builds are performed only by the dedicated remote builder. In the web administration panel, open **Android**, enter the version and version code, then select **Start remote build**. The builder downloads the current repository ref, runs Gradle in its isolated Android toolchain container, signs the APK, and adds it to the release library.

Do not run Android builds on the web application host. See [build-server/README.md](build-server/README.md) for the remote host deployment and storage layout.

The remote release builder injects `android/app/src/main/res/drawable/app_icon.png` when an administrator has uploaded a replacement icon. The checked-in vector icon is used otherwise.
