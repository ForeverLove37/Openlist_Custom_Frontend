FROM ghcr.io/cirruslabs/android-sdk:35

USER root
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl unzip ca-certificates imagemagick \
    && rm -rf /var/lib/apt/lists/* \
    && curl -fsSL https://services.gradle.org/distributions/gradle-8.9-bin.zip -o /tmp/gradle.zip \
    && unzip -q /tmp/gradle.zip -d /opt \
    && ln -s /opt/gradle-8.9/bin/gradle /usr/local/bin/gradle \
    && rm /tmp/gradle.zip \
    && yes | sdkmanager "build-tools;34.0.0" "build-tools;35.0.0" "platforms;android-35"
