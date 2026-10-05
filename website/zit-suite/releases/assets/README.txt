Upload the installers for each release here, with exactly these names (Tauri's default output):

  ZIT-Suite_0.1.0_x64-setup.exe     Windows (NSIS)   src-tauri/target/release/bundle/nsis/
  ZIT-Suite_0.1.0_amd64.deb         Debian/Ubuntu    src-tauri/target/release/bundle/deb/
  ZIT-Suite-0.1.0-1.x86_64.rpm      Fedora/openSUSE  src-tauri/target/release/bundle/rpm/
  SHA256SUMS.txt                    optional: `sha256sum *.exe *.deb *.rpm > SHA256SUMS.txt`

The homepage shows the real file size of each download and its SHA-256 (from SHA256SUMS.txt)
automatically. Until a file is uploaded, its button says "Coming soon".
For a new version, update the file names / version in ../../index.html (search for 0.1.0).
