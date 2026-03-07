cask "notedeck" do
  version "0.1.3"
  sha256 :no_check # Updated on each release

  url "https://github.com/hitalin/notedeck/releases/download/v#{version}/NoteDeck-#{version}-macos-universal.dmg"
  name "NoteDeck"
  desc "Misskey deck client for desktop"
  homepage "https://github.com/hitalin/notedeck"

  livecheck do
    url :url
    strategy :github_latest
  end

  app "NoteDeck.app"

  zap trash: [
    "~/Library/Application Support/com.notedeck.desktop",
    "~/Library/Caches/com.notedeck.desktop",
    "~/Library/Preferences/com.notedeck.desktop.plist",
  ]
end
