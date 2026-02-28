{
  description = "NoteDeck - Misskey deck client";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs {
          inherit system;
          config.allowUnfree = true;
        };

        androidEnv = pkgs.androidenv.override { licenseAccepted = true; };
        androidComposition = androidEnv.composeAndroidPackages {
          platformVersions = [ "36" ];
          buildToolsVersions = [ "35.0.0" "36.0.0" ];
          includeNDK = true;
          ndkVersions = [ "27.0.12077973" ];
          includeEmulator = false;
        };
        androidSdk = androidComposition.androidsdk;
        androidHome = "${androidSdk}/libexec/android-sdk";

        desktopDeps = with pkgs; [
          openssl
          gtk3
          webkitgtk_4_1
          libayatana-appindicator
          librsvg
          glib-networking
        ];
      in
      {
        packages.default = pkgs.stdenv.mkDerivation (finalAttrs: {
          pname = "notedeck";
          version = "0.0.10";
          src = ./.;

          cargoDeps = pkgs.rustPlatform.importCargoLock {
            lockFile = ./src-tauri/Cargo.lock;
          };

          pnpmDeps = pkgs.fetchPnpmDeps {
            inherit (finalAttrs) pname version src;
            pnpm = pkgs.pnpm_9;
            fetcherVersion = 3;
            hash = "sha256-lV3ReT0XVb0kEEG+8ldq/02xLzyTsoxpfHM/dI9TnOc=";
          };

          nativeBuildInputs = with pkgs; [
            cargo
            rustc
            rustPlatform.cargoSetupHook
            pnpm_9
            pnpmConfigHook
            nodejs
            pkg-config
            wrapGAppsHook3
          ];

          buildInputs = desktopDeps;

          cargoRoot = "src-tauri";

          buildPhase = ''
            runHook preBuild
            pnpm build
            cd src-tauri
            cargo build --release
            cd ..
            runHook postBuild
          '';

          installPhase = ''
            runHook preInstall

            install -Dm755 src-tauri/target/release/notedeck $out/bin/notedeck

            install -Dm644 src-tauri/icons/128x128.png \
              $out/share/icons/hicolor/128x128/apps/com.notedeck.desktop.png
            install -Dm644 src-tauri/icons/32x32.png \
              $out/share/icons/hicolor/32x32/apps/com.notedeck.desktop.png
            install -Dm644 src-tauri/icons/icon.svg \
              $out/share/icons/hicolor/scalable/apps/com.notedeck.desktop.svg

            install -Dm644 /dev/stdin $out/share/applications/com.notedeck.desktop <<EOF
            [Desktop Entry]
            Name=NoteDeck
            Exec=notedeck
            Icon=com.notedeck.desktop
            Type=Application
            Categories=Network;InstantMessaging;
            Comment=Misskey deck client
            EOF

            runHook postInstall
          '';

          meta = with pkgs.lib; {
            description = "Misskey deck client";
            homepage = "https://github.com/hitalin/notedeck";
            license = licenses.agpl3Plus;
            mainProgram = "notedeck";
            platforms = platforms.linux;
          };
        });

        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            # Java
            jdk17

            # Node.js
            nodejs

            # Rust
            rustup

            # Tauri desktop dependencies (Linux)
            pkg-config
          ] ++ desktopDeps;

          JAVA_HOME = "${pkgs.jdk17}";
          ANDROID_HOME = androidHome;
          ANDROID_SDK_ROOT = androidHome;
          NDK_HOME = "${androidHome}/ndk/27.0.12077973";
          GRADLE_OPTS = "-Dorg.gradle.project.android.aapt2FromMavenOverride=${androidHome}/build-tools/36.0.0/aapt2";

          shellHook = ''
            export PATH="${androidHome}/platform-tools:$PATH"
          '';
        };
      }
    );
}
