# Linux notes

Canopy replaces Java/SWT with Electron's bundled Chromium UI, uses bundled local fonts with system fallbacks, and does not require a specific desktop theme or system WebKit. Standard Node modules handle the database connection without a distro-specific native MongoDB binding.

## Supported build target

The current target is x64 glibc Linux. The test host is Ubuntu 25.10. Fedora, Debian, Arch, other desktop environments, Wayland sessions, and different graphics drivers need separate runtime checks before being advertised as verified. Alpine/musl and 32-bit Linux are not supported by this build.

## Portable archive

`npm run dist:linux` produces a `tar.gz` containing the desktop app. Extract and execute `canopy-mongo`. The archive does not need FUSE. Chromium still requires the usual desktop libraries and a permitted sandbox configuration.

## AppImage

Make the file executable and run it:

```bash
chmod +x Canopy-0.3.0.AppImage
./Canopy-0.3.0.AppImage
```

If FUSE is unavailable, use the tarball or extract the image with `--appimage-extract` and run the contained `AppRun`.

## Sandboxing

Some distributions restrict unprivileged user namespaces through AppArmor or another policy. This can prevent an unpacked Chromium-based app from launching. Canopy does not change the kernel setting, install a privileged helper, or append `--no-sandbox` in its launcher. Prefer a distribution-approved application profile/installation. Do not globally disable sandbox protections to make a portable build launch.

## Keyrings

Saved connection strings require Secret Service, KWallet, or another backend accepted by Electron safeStorage. If no secure backend is available or the keyring is locked, use a session-only connection by leaving Remember connection unchecked. There is no plaintext credential fallback.

## MongoDB networking

Use the full URI for authentication, TLS options, replica-set hosts, and SRV connections. For an SSH-only server, fill in **SSH tunnel** with `user@bastion`, `ssh://user@bastion:2222`, or a `~/.ssh/config` alias. Canopy runs the system `ssh` client, so your keys, agent, `ProxyJump`, and `known_hosts` apply; it never prompts for passwords (BatchMode), and an unknown host key is rejected until you connect once with `ssh` yourself. The tunnel reaches the first host in a `mongodb://` URI with `directConnection=true`; `mongodb+srv://` is not supported through a tunnel. TLS hostnames may need adjusting; do not disable certificate verification merely to hide a configuration issue.

No saved connection is automatically connected.
