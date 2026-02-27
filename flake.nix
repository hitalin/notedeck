{
  description = "NoteDeck development environment";

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
      in
      {
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
            openssl
            gtk3
            webkitgtk_4_1
            libayatana-appindicator
            librsvg
            glib-networking
          ];

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
