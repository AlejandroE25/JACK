# SSH Key Authentication Setup

Guide for setting up passwordless SSH authentication from Mac to Windows Server.

## Overview

This guide helps you configure SSH key-based authentication to connect from your Mac to the proPACE Windows server without entering a password each time. This is essential for automated deployments and convenient remote management.

## Prerequisites

- SSH server running on Windows (OpenSSH Server)
- Mac with SSH client (built-in)
- Administrator access on Windows machine

## Quick Setup

### On Your Mac

#### 1. Generate SSH Key (if needed)

```bash
# Check if you already have a key
ls -la ~/.ssh/id_*.pub

# If no key exists, generate one
ssh-keygen -t ed25519 -C "your_email@example.com"
# Press Enter to accept default location (~/.ssh/id_ed25519)
# Enter a passphrase (optional but recommended)
```

#### 2. Copy Your Public Key to Windows

**Option A: Automatic (recommended)**
```bash
cat ~/.ssh/id_ed25519.pub | ssh ajesc@10.0.0.69 "powershell -Command \"Add-Content -Path C:\ProgramData\ssh\administrators_authorized_keys -Value (Get-Content -Raw)\""
```

**Option B: Manual**
```bash
# View your public key
cat ~/.ssh/id_ed25519.pub

# Copy the output, then SSH to Windows and add it manually:
ssh ajesc@10.0.0.69
# On Windows:
# Add your public key to C:\ProgramData\ssh\administrators_authorized_keys
```

#### 3. Test the Connection

```bash
# Test SSH connection (should not ask for password)
ssh ajesc@10.0.0.69

# If it still asks for password, debug with verbose mode:
ssh -v ajesc@10.0.0.69
```

#### 4. (Optional) Add SSH Config Alias

Make connection even easier by adding an alias to your SSH config:

```bash
# Edit ~/.ssh/config on your Mac
nano ~/.ssh/config

# Add these lines:
Host propace
    HostName 10.0.0.69
    User ajesc
    IdentityFile ~/.ssh/id_ed25519

# Save and exit (Ctrl+O, Enter, Ctrl+X)
```

Now you can simply use:
```bash
ssh propace
```

### On Windows (Pre-configured)

The Windows server should already be configured with:
- OpenSSH Server installed and running
- Correct authorized_keys file at `C:\ProgramData\ssh\administrators_authorized_keys`
- Proper permissions (SYSTEM and Administrators only)
- PubkeyAuthentication enabled in sshd_config

## Important Notes

### Administrator vs Regular Users

Windows OpenSSH handles administrator accounts differently:

- **Regular users:** `C:\Users\username\.ssh\authorized_keys`
- **Administrators:** `C:\ProgramData\ssh\administrators_authorized_keys`

If you're connecting as an administrator (like `ajesc`), your public key **must** be in the administrators file, not the user's .ssh directory. This is a Windows security feature.

### File Permissions

The `administrators_authorized_keys` file must have strict permissions:
- Only SYSTEM and Administrators groups should have access
- No other users should have read access

To verify/fix permissions on Windows:
```powershell
icacls C:\ProgramData\ssh\administrators_authorized_keys /inheritance:r
icacls C:\ProgramData\ssh\administrators_authorized_keys /grant "Administrators:F"
icacls C:\ProgramData\ssh\administrators_authorized_keys /grant "SYSTEM:F"
```

## Troubleshooting

### Still Asking for Password

1. **Check file permissions on Windows:**
   ```powershell
   icacls C:\ProgramData\ssh\administrators_authorized_keys
   # Should show only Administrators and SYSTEM
   ```

2. **Verify SSH service is running:**
   ```powershell
   Get-Service sshd
   ```

3. **Check if your key is in the right file:**
   ```powershell
   Get-Content C:\ProgramData\ssh\administrators_authorized_keys
   ```

4. **Test with verbose logging on Mac:**
   ```bash
   ssh -vvv ajesc@10.0.0.69
   # Look for "Offering public key" and "Server accepts key"
   ```

5. **Check Windows SSH logs:**
   ```powershell
   Get-EventLog -LogName "OpenSSH/Operational" -Newest 20
   ```

### Key Not Being Offered

If SSH doesn't offer your key:

```bash
# Explicitly specify the key
ssh -i ~/.ssh/id_ed25519 ajesc@10.0.0.69

# Add to ~/.ssh/config:
Host propace
    HostName 10.0.0.69
    User ajesc
    IdentityFile ~/.ssh/id_ed25519
    IdentitiesOnly yes
```

### Permission Denied (publickey)

This usually means:
- Key not in authorized_keys file
- Wrong file permissions on Windows
- SSH server not configured to accept keys

Verify SSH server config on Windows:
```powershell
Get-Content C:\ProgramData\ssh\sshd_config | Select-String -Pattern "PubkeyAuthentication|AuthorizedKeysFile"
```

## Using with Deployment Scripts

Once SSH key authentication is working, the deployment scripts will run without password prompts:

```bash
# From your Mac
./scripts/deploy-windows.sh
```

The script will automatically:
- SSH to the Windows server
- Pull latest code
- Rebuild the project
- Restart the service

## Security Best Practices

1. **Use a passphrase** for your SSH key
2. **Keep your private key secure** (never share `id_ed25519`)
3. **Only share public keys** (`id_ed25519.pub`)
4. **Use different keys** for different purposes if needed
5. **Regularly rotate keys** (every 6-12 months)
6. **Disable password authentication** once keys are working (optional, for maximum security)

## References

- [Microsoft OpenSSH Documentation](https://docs.microsoft.com/en-us/windows-server/administration/openssh/)
- [SSH Key Best Practices](https://www.ssh.com/academy/ssh/key)
