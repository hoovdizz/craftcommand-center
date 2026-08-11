#Requires -Version 5.1

<#
=====================================================================
 Minecraft Bedrock + CraftCommand Center
 Windows Docker Desktop Deployment / Refresh Script
=====================================================================

 Minecraft:
   https://github.com/binhex/arch-minecraftbedrockserver

 CraftCommand Center:
   https://github.com/hoovdizz/craftcommand-center

 FEATURES
 --------------------------------------------------------------------
 - Validates Windows
 - Self-elevates to Administrator
 - Validates Docker Desktop / Docker CLI
 - Starts Docker Desktop if needed
 - Validates Linux container mode
 - Prompts for CraftCommand latest or development
 - Preserves persistent Minecraft data
 - Preserves persistent CraftCommand data
 - Prompts for shared WebUI credentials
 - Applies the credentials to Minecraft and CraftCommand Center
 - Removes old containers
 - Removes cached images
 - Pulls fresh images
 - Recreates Windows Firewall rules
 - Deploys Minecraft
 - Deploys CraftCommand Center
 - Validates resulting containers and ports

 PERSISTENT DATA
 --------------------------------------------------------------------
 Minecraft:
   C:\Docker\minecraftbedrockserver

 CraftCommand:
   C:\Docker\craftcommand-center\data
   C:\Docker\craftcommand-center\backups

=====================================================================
#>


param(

    [ValidateSet("latest", "development")]
    [string]$CraftChannel

)


$ErrorActionPreference = "Stop"


# ====================================================================
# CONFIGURATION
# ====================================================================

$DockerRoot = "C:\Docker"


# --------------------------------------------------------------------
# Minecraft
# --------------------------------------------------------------------

$MinecraftContainer = "minecraftbedrockserver"

$MinecraftImage = "binhex/arch-minecraftbedrockserver:latest"

$MinecraftConfig = Join-Path `
    $DockerRoot `
    "minecraftbedrockserver"


$MinecraftWebUIPort = 8222

$MinecraftPort = 19132

$MinecraftPortV6 = 19133


# Binhex values are replaced by the shared credential prompt.

$MinecraftBackupHours = "12"

$MinecraftPurgeDays = "14"

$MinecraftWebConsole = "yes"

$MinecraftWebAuth = "yes"

$MinecraftWebUser = "admin"

$MinecraftWebPassword = "minecraft"

$MinecraftWebTitle = "Minecraft Bedrock"

$MinecraftStartupCommand = "gamerule showcoordinates true"


$MinecraftUMASK = "000"

$MinecraftPUID = "0"

$MinecraftPGID = "0"


# --------------------------------------------------------------------
# CraftCommand Center
# --------------------------------------------------------------------

$CraftContainer = "craftcommand-center"

$CraftImageBase = "ghcr.io/hoovdizz/craftcommand-center"

$CraftRoot = Join-Path `
    $DockerRoot `
    "craftcommand-center"

$CraftData = Join-Path `
    $CraftRoot `
    "data"

$CraftBackups = Join-Path `
    $CraftRoot `
    "backups"

$CraftPort = 8223


# These values seed the username prompt and are never deployed unchanged
# without an explicit credential confirmation.

$CraftUsername = "admin"

$CraftPassword = "changemenow"


# --------------------------------------------------------------------
# General
# --------------------------------------------------------------------

$TimeZone = "America/New_York"



# ====================================================================
# FUNCTIONS
# ====================================================================


function Write-Section {

    param(
        [string]$Text
    )

    Write-Host ""

    Write-Host `
        "====================================================================" `
        -ForegroundColor DarkGray

    Write-Host `
        " $Text" `
        -ForegroundColor Cyan

    Write-Host `
        "====================================================================" `
        -ForegroundColor DarkGray

    Write-Host ""

}



function Test-IsAdministrator {

    $Identity = `
        [Security.Principal.WindowsIdentity]::GetCurrent()

    $Principal = `
        New-Object Security.Principal.WindowsPrincipal($Identity)

    return $Principal.IsInRole(
        [Security.Principal.WindowsBuiltInRole]::Administrator
    )

}



function Test-DockerContainerExists {

    param(
        [string]$Name
    )

    $Result = & docker ps -a `
        --filter "name=^/${Name}$" `
        --format "{{.Names}}" `
        2>$null

    return ($Result -contains $Name)

}



function Test-DockerImageExists {

    param(
        [string]$Image
    )

    $Result = & docker image ls `
        --quiet `
        $Image `
        2>$null

    return -not [string]::IsNullOrWhiteSpace(
        ($Result | Out-String).Trim()
    )

}



function Get-ContainerEnvironmentValue {

    param(

        [string]$Container,

        [string]$Variable,

        [string]$Default

    )


    if (-not (Test-DockerContainerExists $Container)) {

        return $Default

    }


    try {

        $Environment = & docker inspect `
            $Container `
            --format "{{range .Config.Env}}{{println .}}{{end}}" `
            2>$null


        foreach ($Entry in $Environment) {

            if ($Entry -like "$Variable=*") {

                return $Entry.Substring(
                    $Variable.Length + 1
                )

            }

        }

    }
    catch {

    }


    return $Default

}



function ConvertFrom-SecureCredentialString {

    param(
        [Parameter(Mandatory = $true)]
        [Security.SecureString]$SecureValue
    )


    $Pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureValue)


    try {

        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($Pointer)

    }
    finally {

        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($Pointer)

    }

}



function Remove-DockerContainer {

    param(
        [string]$Name
    )


    if (Test-DockerContainerExists $Name) {

        Write-Host `
            "Removing container: $Name" `
            -ForegroundColor Yellow


        & docker rm `
            -f `
            $Name


        if ($LASTEXITCODE -ne 0) {

            throw "Unable to remove Docker container: $Name"

        }


        Write-Host `
            "Removed container: $Name" `
            -ForegroundColor Green

    }
    else {

        Write-Host `
            "Container not currently installed: $Name" `
            -ForegroundColor DarkGray

    }

}



function Remove-DockerImage {

    param(
        [string]$Image
    )


    if (Test-DockerImageExists $Image) {

        Write-Host `
            "Removing cached image: $Image" `
            -ForegroundColor Yellow


        & docker image rm `
            -f `
            $Image


        if ($LASTEXITCODE -eq 0) {

            Write-Host `
                "Removed image: $Image" `
                -ForegroundColor Green

        }
        else {

            Write-Host `
                "Could not completely remove $Image." `
                -ForegroundColor Yellow

        }

    }
    else {

        Write-Host `
            "Image not cached: $Image" `
            -ForegroundColor DarkGray

    }

}



function Pull-DockerImage {

    param(
        [string]$Image
    )


    Write-Host ""

    Write-Host `
        "Pulling image:" `
        -ForegroundColor Cyan

    Write-Host `
        "  $Image"


    & docker pull $Image


    if ($LASTEXITCODE -ne 0) {

        throw "Unable to pull Docker image: $Image"

    }


    Write-Host ""

    Write-Host `
        "Image downloaded successfully." `
        -ForegroundColor Green

}



function Set-FirewallRule {

    param(

        [string]$Name,

        [ValidateSet("TCP", "UDP")]
        [string]$Protocol,

        [int]$Port,

        [string]$RemoteAddress = "Any"

    )


    # Remove existing copy so we know the settings are correct.

    Get-NetFirewallRule `
        -DisplayName $Name `
        -ErrorAction SilentlyContinue |
        Remove-NetFirewallRule `
            -ErrorAction SilentlyContinue


    $Arguments = @{

        DisplayName = $Name

        Direction = "Inbound"

        Action = "Allow"

        Protocol = $Protocol

        LocalPort = $Port

        Profile = "Any"

        Enabled = "True"

    }


    if ($RemoteAddress -ne "Any") {

        $Arguments.RemoteAddress = $RemoteAddress

    }


    New-NetFirewallRule @Arguments |
        Out-Null


    Write-Host `
        "Firewall: $Protocol $Port allowed ($RemoteAddress)" `
        -ForegroundColor Green

}



# ====================================================================
# HEADER
# ====================================================================


Clear-Host


Write-Host ""

Write-Host `
    "====================================================================" `
    -ForegroundColor Green

Write-Host `
    " Minecraft Bedrock + CraftCommand Center" `
    -ForegroundColor Green

Write-Host `
    " Windows Docker Deployment" `
    -ForegroundColor Green

Write-Host `
    "====================================================================" `
    -ForegroundColor Green

Write-Host ""



# ====================================================================
# 1. VALIDATE WINDOWS
# ====================================================================


Write-Section "1. Validate Windows"


if ($env:OS -ne "Windows_NT") {

    Write-Host `
        "ERROR: This script is designed for Windows." `
        -ForegroundColor Red

    exit 1

}


Write-Host `
    "Windows detected." `
    -ForegroundColor Green



# ====================================================================
# 2. ELEVATE TO ADMINISTRATOR
# ====================================================================


Write-Section "2. Validate Administrator Rights"


if (-not (Test-IsAdministrator)) {

    Write-Host `
        "Administrator rights are required for Windows Firewall configuration." `
        -ForegroundColor Yellow

    Write-Host `
        "Relaunching PowerShell as Administrator..." `
        -ForegroundColor Yellow


    if (-not $PSCommandPath) {

        Write-Host ""

        Write-Host `
            "ERROR: Save this script as a .ps1 file before running it." `
            -ForegroundColor Red

        exit 1

    }


    $Arguments = @(

        "-NoProfile",

        "-ExecutionPolicy",
        "Bypass",

        "-File",
        "`"$PSCommandPath`""

    )


    if ($CraftChannel) {

        $Arguments += @(
            "-CraftChannel",
            $CraftChannel
        )

    }


    Start-Process `
        "powershell.exe" `
        -Verb RunAs `
        -ArgumentList $Arguments


    exit

}


Write-Host `
    "Running as Administrator." `
    -ForegroundColor Green



# ====================================================================
# 3. VALIDATE DOCKER INSTALLATION
# ====================================================================


Write-Section "3. Validate Docker Desktop"


$DockerDesktopLocations = @(

    "C:\Program Files\Docker\Docker\Docker Desktop.exe",

    "$env:LOCALAPPDATA\Docker\Docker Desktop.exe"

)


$DockerDesktopExe = $null


foreach ($Location in $DockerDesktopLocations) {

    if (Test-Path $Location) {

        $DockerDesktopExe = $Location

        break

    }

}



# --------------------------------------------------------------------
# Find Docker CLI
# --------------------------------------------------------------------


$DockerCommand = `
    Get-Command docker `
        -ErrorAction SilentlyContinue


if (-not $DockerCommand) {

    $DockerCliFolder = `
        "C:\Program Files\Docker\Docker\resources\bin"

    $DockerCliExe = `
        Join-Path `
            $DockerCliFolder `
            "docker.exe"


    if (Test-Path $DockerCliExe) {

        Write-Host `
            "Docker CLI installed but missing from current PATH." `
            -ForegroundColor Yellow


        $env:Path = `
            "$DockerCliFolder;$env:Path"


        $DockerCommand = `
            Get-Command docker `
                -ErrorAction SilentlyContinue

    }

}



if (-not $DockerCommand) {

    Write-Host ""

    Write-Host `
        "ERROR: Docker Desktop / Docker CLI was not found." `
        -ForegroundColor Red

    Write-Host ""

    Write-Host `
        "Install Docker Desktop for Windows before running this deployment."

    exit 1

}


Write-Host `
    "Docker CLI found:" `
    -ForegroundColor Green

Write-Host `
    "  $($DockerCommand.Source)"



if ($DockerDesktopExe) {

    Write-Host ""

    Write-Host `
        "Docker Desktop found:" `
        -ForegroundColor Green

    Write-Host `
        "  $DockerDesktopExe"

}



# ====================================================================
# 4. START / VALIDATE DOCKER ENGINE
# ====================================================================


Write-Section "4. Validate Docker Engine"


$DockerRunning = $false


try {

    & docker info *> $null


    if ($LASTEXITCODE -eq 0) {

        $DockerRunning = $true

    }

}
catch {

}



if (-not $DockerRunning) {

    if (-not $DockerDesktopExe) {

        Write-Host `
            "ERROR: Docker Engine is not running." `
            -ForegroundColor Red

        exit 1

    }


    Write-Host `
        "Docker Engine is not responding." `
        -ForegroundColor Yellow

    Write-Host `
        "Starting Docker Desktop..." `
        -ForegroundColor Yellow


    Start-Process $DockerDesktopExe


    for ($Attempt = 1; $Attempt -le 60; $Attempt++) {

        Start-Sleep `
            -Seconds 2


        try {

            & docker info *> $null


            if ($LASTEXITCODE -eq 0) {

                $DockerRunning = $true

                break

            }

        }
        catch {

        }

    }

}



if (-not $DockerRunning) {

    Write-Host ""

    Write-Host `
        "ERROR: Docker Engine could not be started." `
        -ForegroundColor Red

    Write-Host `
        "Open Docker Desktop and confirm it starts successfully."

    exit 1

}


Write-Host `
    "Docker Engine is running." `
    -ForegroundColor Green



# ====================================================================
# 5. VALIDATE LINUX CONTAINERS
# ====================================================================


Write-Section "5. Validate Linux Container Mode"


$DockerOSType = `
    (& docker info `
        --format "{{.OSType}}" `
        2>$null).Trim()


if ($DockerOSType -ne "linux") {

    Write-Host ""

    Write-Host `
        "ERROR: Docker Desktop is not using Linux containers." `
        -ForegroundColor Red

    Write-Host ""

    Write-Host `
        "Current Docker OSType: $DockerOSType"

    Write-Host ""

    Write-Host `
        "Switch Docker Desktop to Linux containers and rerun the script."

    exit 1

}


$DockerVersion = `
    (& docker version `
        --format "{{.Server.Version}}" `
        2>$null).Trim()


Write-Host `
    "Linux container mode confirmed." `
    -ForegroundColor Green

Write-Host `
    "Docker Engine version: $DockerVersion"



# ====================================================================
# 6. SELECT CRAFTCOMMAND CHANNEL
# ====================================================================


Write-Section "6. Select CraftCommand Center Build"


if ([string]::IsNullOrWhiteSpace($CraftChannel)) {

    Write-Host `
        "Select the CraftCommand Center release:"


    Write-Host ""

    Write-Host `
        "  [1] Latest" `
        -ForegroundColor Green

    Write-Host `
        "      main branch"

    Write-Host `
        "      ghcr.io/hoovdizz/craftcommand-center:latest"


    Write-Host ""

    Write-Host `
        "  [2] Development" `
        -ForegroundColor Yellow

    Write-Host `
        "      development branch"

    Write-Host `
        "      ghcr.io/hoovdizz/craftcommand-center:development"


    Write-Host ""


    do {

        $Selection = `
            Read-Host "Enter 1 or 2"

    }
    until ($Selection -in @("1", "2"))


    if ($Selection -eq "2") {

        $CraftChannel = "development"

    }
    else {

        $CraftChannel = "latest"

    }

}


$CraftImage = `
    "${CraftImageBase}:${CraftChannel}"


Write-Host ""

Write-Host `
    "Selected:" `
    -ForegroundColor Cyan

Write-Host `
    "  $CraftImage"



# ====================================================================
# 7. PRESERVE EXISTING ENVIRONMENT SETTINGS
# ====================================================================


Write-Section "7. Preserve Existing Configuration"



# --------------------------------------------------------------------
# Minecraft
# --------------------------------------------------------------------


if (Test-DockerContainerExists $MinecraftContainer) {

    Write-Host `
        "Existing Minecraft container detected." `
        -ForegroundColor Green


    $MinecraftBackupHours = `
        Get-ContainerEnvironmentValue `
            $MinecraftContainer `
            "CREATE_BACKUP_HOURS" `
            $MinecraftBackupHours


    $MinecraftPurgeDays = `
        Get-ContainerEnvironmentValue `
            $MinecraftContainer `
            "PURGE_BACKUP_DAYS" `
            $MinecraftPurgeDays


    $MinecraftWebUser = `
        Get-ContainerEnvironmentValue `
            $MinecraftContainer `
            "WEBUI_USER" `
            $MinecraftWebUser


    $MinecraftWebTitle = `
        Get-ContainerEnvironmentValue `
            $MinecraftContainer `
            "WEBUI_CONSOLE_TITLE" `
            $MinecraftWebTitle


    $MinecraftStartupCommand = `
        Get-ContainerEnvironmentValue `
            $MinecraftContainer `
            "STARTUP_CMD" `
            $MinecraftStartupCommand

}
else {

    Write-Host `
        "No existing Minecraft container. Defaults will be used." `
        -ForegroundColor DarkGray

}



# --------------------------------------------------------------------
# CraftCommand
# --------------------------------------------------------------------


if (Test-DockerContainerExists $CraftContainer) {

    Write-Host `
        "Existing CraftCommand container detected." `
        -ForegroundColor Green


    $CraftUsername = `
        Get-ContainerEnvironmentValue `
            $CraftContainer `
            "CCC_USERNAME" `
            $CraftUsername


}
else {

    Write-Host `
        "No existing CraftCommand container. Defaults will be used." `
        -ForegroundColor DarkGray

}



# ====================================================================
# 7B. CONFIGURE SHARED WEB CREDENTIALS
# ====================================================================


Write-Section "7B. Configure WebUI Credentials"


Write-Host `
    "These credentials will be used for both:" `
    -ForegroundColor Cyan

Write-Host "  - Binhex Minecraft WebUI console"

Write-Host "  - CraftCommand Center administrator"

Write-Host ""


$SuggestedUsername = $CraftUsername


do {

    $EnteredUsername = Read-Host "Username [$SuggestedUsername]"


    if ([string]::IsNullOrWhiteSpace($EnteredUsername)) {

        $EnteredUsername = $SuggestedUsername

    }


    $EnteredUsername = $EnteredUsername.Trim()


    if ($EnteredUsername -notmatch '^[A-Za-z0-9_.-]{3,32}$') {

        Write-Host `
            "Username must be 3-32 characters using letters, numbers, dots, dashes, or underscores." `
            -ForegroundColor Yellow

    }

}
until ($EnteredUsername -match '^[A-Za-z0-9_.-]{3,32}$')


do {

    $SecurePassword = Read-Host `
        "Password (minimum 10 characters)" `
        -AsSecureString


    $EnteredPassword = ConvertFrom-SecureCredentialString $SecurePassword


    if ($EnteredPassword.Length -lt 10) {

        Write-Host `
            "Password must contain at least 10 characters." `
            -ForegroundColor Yellow

        continue

    }


    $SecureConfirmation = Read-Host `
        "Confirm password" `
        -AsSecureString


    $ConfirmedPassword = ConvertFrom-SecureCredentialString $SecureConfirmation


    if ($EnteredPassword -cne $ConfirmedPassword) {

        Write-Host `
            "Passwords do not match. Try again." `
            -ForegroundColor Yellow

        $EnteredPassword = $null

    }

}
until (
    $EnteredPassword -and
    $EnteredPassword.Length -ge 10 -and
    $EnteredPassword -ceq $ConfirmedPassword
)


$MinecraftWebUser = $EnteredUsername

$MinecraftWebPassword = $EnteredPassword

$CraftUsername = $EnteredUsername

$CraftPassword = $EnteredPassword


Write-Host ""

Write-Host `
    "Shared username configured: $EnteredUsername" `
    -ForegroundColor Green

Write-Host `
    "Password accepted and will not be displayed." `
    -ForegroundColor Green


$SecurePassword = $null

$SecureConfirmation = $null

$ConfirmedPassword = $null



# ====================================================================
# 8. CREATE PERSISTENT DIRECTORIES
# ====================================================================


Write-Section "8. Validate Persistent Storage"


$RequiredDirectories = @(

    $DockerRoot,

    $MinecraftConfig,

    $CraftRoot,

    $CraftData,

    $CraftBackups

)


foreach ($Directory in $RequiredDirectories) {

    if (-not (Test-Path $Directory)) {

        New-Item `
            -ItemType Directory `
            -Path $Directory `
            -Force |
            Out-Null


        Write-Host `
            "Created: $Directory" `
            -ForegroundColor Green

    }
    else {

        Write-Host `
            "Exists:  $Directory" `
            -ForegroundColor DarkGray

    }

}


Write-Host ""

Write-Host `
    "Minecraft persistent data:" `
    -ForegroundColor White

Write-Host `
    "  $MinecraftConfig"


Write-Host ""

Write-Host `
    "CraftCommand persistent data:" `
    -ForegroundColor White

Write-Host `
    "  $CraftData"

Write-Host `
    "  $CraftBackups"


Write-Host ""

Write-Host `
    "Persistent data WILL NOT be deleted." `
    -ForegroundColor Green



# ====================================================================
# 9. REMOVE EXISTING CONTAINERS
# ====================================================================


Write-Section "9. Remove Existing Containers"


Remove-DockerContainer `
    $CraftContainer


Remove-DockerContainer `
    $MinecraftContainer



# ====================================================================
# 10. REMOVE CACHED IMAGES
# ====================================================================


Write-Section "10. Remove Cached Images"


Remove-DockerImage `
    "binhex/arch-minecraftbedrockserver:latest"


Remove-DockerImage `
    "${CraftImageBase}:latest"


Remove-DockerImage `
    "${CraftImageBase}:development"



# ====================================================================
# 11. PULL FRESH IMAGES
# ====================================================================


Write-Section "11. Pull Fresh Docker Images"


Pull-DockerImage `
    $MinecraftImage


Pull-DockerImage `
    $CraftImage



# ====================================================================
# 12. WINDOWS FIREWALL
# ====================================================================


Write-Section "12. Configure Windows Firewall"


Write-Host `
    "Recreating firewall rules to ensure Minecraft LAN connectivity..." `
    -ForegroundColor Cyan


Write-Host ""


# --------------------------------------------------------------------
# Minecraft Bedrock
#
# Xbox / Bedrock LAN traffic requires UDP 19132.
#
# TCP rules are also included because the Docker container publishes both.
# --------------------------------------------------------------------


Set-FirewallRule `
    -Name "Minecraft Bedrock UDP 19132" `
    -Protocol UDP `
    -Port 19132 `
    -RemoteAddress Any


Set-FirewallRule `
    -Name "Minecraft Bedrock TCP 19132" `
    -Protocol TCP `
    -Port 19132 `
    -RemoteAddress Any


Set-FirewallRule `
    -Name "Minecraft Bedrock UDP 19133" `
    -Protocol UDP `
    -Port 19133 `
    -RemoteAddress Any


Set-FirewallRule `
    -Name "Minecraft Bedrock TCP 19133" `
    -Protocol TCP `
    -Port 19133 `
    -RemoteAddress Any



# --------------------------------------------------------------------
# Minecraft Web Console
#
# LAN only
# --------------------------------------------------------------------


Set-FirewallRule `
    -Name "Minecraft Bedrock WebUI 8222" `
    -Protocol TCP `
    -Port 8222 `
    -RemoteAddress LocalSubnet



# --------------------------------------------------------------------
# CraftCommand Center
#
# LAN only
# --------------------------------------------------------------------


Set-FirewallRule `
    -Name "CraftCommand Center 8223" `
    -Protocol TCP `
    -Port 8223 `
    -RemoteAddress LocalSubnet



# ====================================================================
# 13. DEPLOY MINECRAFT
# ====================================================================


Write-Section "13. Deploy Minecraft Bedrock"


$MinecraftArguments = @(

    "run",

    "-d",


    "--name",
    $MinecraftContainer,


    "--network",
    "bridge",


    "--restart",
    "unless-stopped",


    "-p",
    "${MinecraftWebUIPort}:8222/tcp",


    "-p",
    "${MinecraftPort}:19132/tcp",


    "-p",
    "${MinecraftPort}:19132/udp",


    "-p",
    "${MinecraftPortV6}:19133/tcp",


    "-p",
    "${MinecraftPortV6}:19133/udp",


    "-v",
    "${MinecraftConfig}:/config",


    "-e",
    "TZ=$TimeZone",


    "-e",
    "CREATE_BACKUP_HOURS=$MinecraftBackupHours",


    "-e",
    "PURGE_BACKUP_DAYS=$MinecraftPurgeDays",


    "-e",
    "ENABLE_WEBUI_CONSOLE=$MinecraftWebConsole",


    "-e",
    "ENABLE_WEBUI_AUTH=$MinecraftWebAuth",


    "-e",
    "WEBUI_USER=$MinecraftWebUser",


    "-e",
    "WEBUI_PASS=$MinecraftWebPassword",


    "-e",
    "WEBUI_CONSOLE_TITLE=$MinecraftWebTitle",


    "-e",
    "STARTUP_CMD=$MinecraftStartupCommand",


    "-e",
    "UMASK=$MinecraftUMASK",


    "-e",
    "PUID=$MinecraftPUID",


    "-e",
    "PGID=$MinecraftPGID",


    $MinecraftImage

)


& docker @MinecraftArguments


if ($LASTEXITCODE -ne 0) {

    throw "Minecraft Bedrock container failed to deploy."

}


Write-Host ""

Write-Host `
    "Minecraft container created." `
    -ForegroundColor Green



# ====================================================================
# 14. DEPLOY CRAFTCOMMAND CENTER
# ====================================================================


Write-Section "14. Deploy CraftCommand Center"


$CraftArguments = @(

    "run",

    "-d",


    "--name",
    $CraftContainer,


    "--restart",
    "unless-stopped",


    "-p",
    "${CraftPort}:8223",


    "-e",
    "CCC_USERNAME=$CraftUsername",


    "-e",
    "CCC_PASSWORD=$CraftPassword",


    "-e",
    "CCC_MINECRAFT_CONTAINER=$MinecraftContainer",


    "-v",
    "${CraftData}:/app/data",


    "-v",
    "${CraftBackups}:/app/backups",


    "-v",
    "/var/run/docker.sock:/var/run/docker.sock",


    $CraftImage

)


& docker @CraftArguments


if ($LASTEXITCODE -ne 0) {

    throw "CraftCommand Center container failed to deploy."

}


Write-Host ""

Write-Host `
    "CraftCommand Center container created." `
    -ForegroundColor Green



# ====================================================================
# 15. WAIT FOR CONTAINERS
# ====================================================================


Write-Section "15. Validate Containers"


Start-Sleep `
    -Seconds 5


& docker ps `
    --filter "name=$MinecraftContainer" `
    --filter "name=$CraftContainer" `
    --format "table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}"


$SocketMount = & docker inspect `
    $CraftContainer `
    --format "{{range .Mounts}}{{if eq .Destination \"/var/run/docker.sock\"}}{{.Source}}{{end}}{{end}}" `
    2>$null

if ([string]::IsNullOrWhiteSpace(($SocketMount | Out-String).Trim())) {
    throw "CraftCommand Center is missing the Docker socket mount. Recreate it with -v /var/run/docker.sock:/var/run/docker.sock."
}

Write-Host `
    "CraftCommand Docker socket mount confirmed." `
    -ForegroundColor Green



# ====================================================================
# 16. VERIFY MINECRAFT PORT MAPPINGS
# ====================================================================


Write-Host ""

Write-Host `
    "Minecraft Docker port mappings:" `
    -ForegroundColor Cyan


& docker port `
    $MinecraftContainer



# ====================================================================
# 17. VERIFY FIREWALL RULES
# ====================================================================


Write-Host ""

Write-Host `
    "Windows Firewall rules:" `
    -ForegroundColor Cyan


Get-NetFirewallRule |
    Where-Object {

        $_.DisplayName -in @(

            "Minecraft Bedrock UDP 19132",

            "Minecraft Bedrock TCP 19132",

            "Minecraft Bedrock UDP 19133",

            "Minecraft Bedrock TCP 19133",

            "Minecraft Bedrock WebUI 8222",

            "CraftCommand Center 8223"

        )

    } |
    Sort-Object DisplayName |
    Format-Table `
        DisplayName,
        Enabled,
        Direction,
        Action `
        -AutoSize



# ====================================================================
# 18. FIND WINDOWS LAN ADDRESS
# ====================================================================


$IPAddress = $null


try {

    $IPAddress = Get-NetIPConfiguration |
        Where-Object {

            $_.IPv4DefaultGateway -and
            $_.IPv4Address

        } |
        ForEach-Object {

            $_.IPv4Address.IPAddress

        } |
        Where-Object {

            $_ -ne "127.0.0.1" -and
            $_ -notlike "169.254.*"

        } |
        Select-Object `
            -First 1

}
catch {

}



# ====================================================================
# 19. FINAL STATUS
# ====================================================================


Write-Section "Deployment Complete"



Write-Host `
    "MINECRAFT BEDROCK" `
    -ForegroundColor Green


Write-Host `
    "--------------------------------------------------------------------"


Write-Host `
    "Container:"

Write-Host `
    "  $MinecraftContainer"


Write-Host ""

Write-Host `
    "Image:"

Write-Host `
    "  $MinecraftImage"


Write-Host ""

Write-Host `
    "Persistent Data:"

Write-Host `
    "  $MinecraftConfig"


Write-Host ""

Write-Host `
    "Web Console:"

Write-Host `
    "  http://localhost:$MinecraftWebUIPort"


if ($IPAddress) {

    Write-Host `
        "  http://${IPAddress}:$MinecraftWebUIPort"

}


Write-Host ""

Write-Host `
    "Minecraft LAN Port:"

Write-Host `
    "  UDP $MinecraftPort"


if ($IPAddress) {

    Write-Host ""

    Write-Host `
        "Xbox / LAN Server Address:" `
        -ForegroundColor Cyan

    Write-Host `
        "  IP:   $IPAddress"

    Write-Host `
        "  Port: $MinecraftPort"

}



Write-Host ""

Write-Host ""

Write-Host `
    "CRAFTCOMMAND CENTER" `
    -ForegroundColor Green


Write-Host `
    "--------------------------------------------------------------------"


Write-Host `
    "Container:"

Write-Host `
    "  $CraftContainer"


Write-Host ""

Write-Host `
    "Channel:"

Write-Host `
    "  $CraftChannel"


Write-Host ""

Write-Host `
    "Image:"

Write-Host `
    "  $CraftImage"


Write-Host ""

Write-Host `
    "Persistent Data:"

Write-Host `
    "  $CraftData"

Write-Host `
    "  $CraftBackups"


Write-Host ""

Write-Host `
    "Dashboard:"

Write-Host `
    "  http://localhost:$CraftPort"


if ($IPAddress) {

    Write-Host `
        "  http://${IPAddress}:$CraftPort"

}



Write-Host ""

Write-Host ""

Write-Host `
    "USEFUL COMMANDS" `
    -ForegroundColor Cyan


Write-Host `
    "--------------------------------------------------------------------"


Write-Host ""

Write-Host `
    "Minecraft logs:"

Write-Host `
    "  docker logs -f $MinecraftContainer"


Write-Host ""

Write-Host `
    "CraftCommand logs:"

Write-Host `
    "  docker logs -f $CraftContainer"


Write-Host ""

Write-Host `
    "Restart Minecraft:"

Write-Host `
    "  docker restart $MinecraftContainer"


Write-Host ""

Write-Host `
    "Restart CraftCommand:"

Write-Host `
    "  docker restart $CraftContainer"


Write-Host ""

Write-Host `
    "Show container status:"

Write-Host `
    "  docker ps"


Write-Host ""

Write-Host `
    "Show Minecraft ports:"

Write-Host `
    "  docker port $MinecraftContainer"


Write-Host ""

Write-Host `
    "Minecraft server.properties:"

Write-Host `
    "  C:\Docker\minecraftbedrockserver\minecraft\server.properties"


Write-Host ""

Write-Host `
    "====================================================================" `
    -ForegroundColor Green

Write-Host `
    " DEPLOYMENT SUCCESSFUL" `
    -ForegroundColor Green

Write-Host `
    "====================================================================" `
    -ForegroundColor Green

Write-Host ""
