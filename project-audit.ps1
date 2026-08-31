Write-Host ""
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host " MEDIA AUTHENTICITY PLATFORM - PROJECT AUDIT" -ForegroundColor Cyan
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host ""

function Check {
    param(
        [string]$Name,
        [bool]$Status,
        [string]$Details
    )

    if ($Status) {
        Write-Host "[PASS] $Name" -ForegroundColor Green
    } else {
        Write-Host "[WARN] $Name" -ForegroundColor Yellow
    }

    if ($Details) {
        Write-Host "       $Details" -ForegroundColor Gray
    }
}

# -----------------------------------------------
# ENVIRONMENT
# -----------------------------------------------

Write-Host "`n--- ENVIRONMENT ---" -ForegroundColor Cyan

$gcloud = Get-Command gcloud -ErrorAction SilentlyContinue
Check "Google Cloud CLI installed" ($null -ne $gcloud) $(if ($gcloud) { gcloud --version | Select-Object -First 1 })

$node = Get-Command node -ErrorAction SilentlyContinue
Check "Node.js installed" ($null -ne $node) $(if ($node) { node --version })

$npm = Get-Command npm -ErrorAction SilentlyContinue
Check "npm installed" ($null -ne $npm) $(if ($npm) { npm --version })

# -----------------------------------------------
# GOOGLE CLOUD
# -----------------------------------------------

Write-Host "`n--- GOOGLE CLOUD ---" -ForegroundColor Cyan

$project = gcloud config get-value project 2>$null
Check "Google Cloud project configured" ($project -eq "media-authenticity-platform") $project

$account = gcloud config get-value account 2>$null
Check "Google account authenticated" ($account -ne "" -and $account -ne "(unset)") $account

# -----------------------------------------------
# ADC
# -----------------------------------------------

Write-Host "`n--- APPLICATION DEFAULT CREDENTIALS ---" -ForegroundColor Cyan

$adcPath = "$env:APPDATA\gcloud\application_default_credentials.json"
$adcExists = Test-Path $adcPath

Check "ADC credentials exist" $adcExists $adcPath

if ($adcExists) {
    $token = gcloud auth application-default print-access-token 2>$null
    Check "ADC can generate access token" ($token.Length -gt 20) "Access token generated successfully"
}

# -----------------------------------------------
# FIRESTORE
# -----------------------------------------------

Write-Host "`n--- FIRESTORE ---" -ForegroundColor Cyan

$firestore = gcloud firestore databases describe `
    --database="(default)" `
    --project="media-authenticity-platform" 2>$null

$firestoreText = $firestore | Out-String

Check "Firestore database exists" ($firestoreText -match "FIRESTORE_NATIVE") "Database: (default)"

Check "Firestore location is asia-south1" `
    ($firestoreText -match "locationId: asia-south1") `
    "Expected: asia-south1"

# -----------------------------------------------
# PROJECT FILES
# -----------------------------------------------

Write-Host "`n--- PROJECT STRUCTURE ---" -ForegroundColor Cyan

$requiredFiles = @(
    "package.json",
    "server.ts",
    "tsconfig.json",
    "vite.config.ts",
    "firestore.rules",
    "firestore.indexes.json",
    "src\backend\db.ts",
    "functions\src\index.ts"
)

foreach ($file in $requiredFiles) {
    $exists = Test-Path $file
    Check $file $exists $(if ($exists) { "Found" } else { "MISSING" })
}

$nodeModules = Test-Path "node_modules"
Check "node_modules installed" $nodeModules

# -----------------------------------------------
# ENVIRONMENT CONFIG
# -----------------------------------------------

Write-Host "`n--- ENVIRONMENT CONFIGURATION ---" -ForegroundColor Cyan

$envExample = Test-Path ".env.example"
$envFile = Test-Path ".env"

Check ".env.example exists" $envExample

if ($envFile) {
    Check ".env exists" $true "Environment file found"
} else {
    Check ".env exists" $false "No .env file found"
}

# -----------------------------------------------
# DEPENDENCIES
# -----------------------------------------------

Write-Host "`n--- FIREBASE / GOOGLE CLOUD DEPENDENCIES ---" -ForegroundColor Cyan

$packageJson = Get-Content "package.json" -Raw

$hasFirebaseAdmin = $packageJson -match '"firebase-admin"'
$hasFirestore = $packageJson -match '"@google-cloud/firestore"'
$hasStorage = $packageJson -match '"@google-cloud/storage"'
$hasFirebase = $packageJson -match '"firebase"'

Check "firebase-admin dependency" $hasFirebaseAdmin
Check "@google-cloud/firestore dependency" $hasFirestore
Check "@google-cloud/storage dependency" $hasStorage
Check "firebase dependency" $hasFirebase

# -----------------------------------------------
# DATABASE IMPLEMENTATION
# -----------------------------------------------

Write-Host "`n--- DATABASE IMPLEMENTATION ---" -ForegroundColor Cyan

$dbFile = "src\backend\db.ts"

if (Test-Path $dbFile) {
    $dbCode = Get-Content $dbFile -Raw

    $inMemory = $dbCode -match "class InMemoryDB"
    $firestoreUse = $dbCode -match "Firestore|firestore|@google-cloud/firestore|firebase-admin"

    Check "InMemoryDB detected" $inMemory `
        $(if ($inMemory) { "Application currently uses in-memory storage" })

    Check "Firestore implementation detected" $firestoreUse `
        $(if ($firestoreUse) { "Firestore references found" } else { "No Firestore implementation found" })
}

# -----------------------------------------------
# STORAGE IMPLEMENTATION
# -----------------------------------------------

Write-Host "`n--- STORAGE ---" -ForegroundColor Cyan

if (Test-Path $dbFile) {
    $storageMemory = $dbCode -match "storageFiles\s*=\s*new Map"

    Check "In-memory media storage detected" $storageMemory `
        $(if ($storageMemory) { "Uploaded files currently stored in process memory" })

    $cloudStorage = $dbCode -match "@google-cloud/storage|Storage\(|getBucket|bucket\("

    Check "Cloud Storage implementation detected" $cloudStorage `
        $(if ($cloudStorage) { "Cloud Storage references found" } else { "No Cloud Storage implementation found" })
}

# -----------------------------------------------
# FIRESTORE RULES / INDEXES
# -----------------------------------------------

Write-Host "`n--- FIRESTORE CONFIGURATION ---" -ForegroundColor Cyan

$rules = Test-Path "firestore.rules"
$indexes = Test-Path "firestore.indexes.json"

Check "Firestore security rules file" $rules
Check "Firestore indexes file" $indexes

# -----------------------------------------------
# CLOUD FUNCTIONS
# -----------------------------------------------

Write-Host "`n--- CLOUD FUNCTIONS ---" -ForegroundColor Cyan

$functionsDir = Test-Path "functions"
$functionsIndex = Test-Path "functions\src\index.ts"

Check "Functions directory" $functionsDir
Check "Functions index.ts" $functionsIndex

# -----------------------------------------------
# BUILD
# -----------------------------------------------

Write-Host "`n--- APPLICATION BUILD ---" -ForegroundColor Cyan

if (Test-Path "package.json") {

    Write-Host "Running TypeScript check..." -ForegroundColor Gray

    npm run lint

    $lintCode = $LASTEXITCODE

    Check "TypeScript check" ($lintCode -eq 0) `
        $(if ($lintCode -eq 0) { "No TypeScript errors" } else { "TypeScript errors detected" })

    Write-Host ""
    Write-Host "Running production build..." -ForegroundColor Gray

    npm run build

    $buildCode = $LASTEXITCODE

    Check "Production build" ($buildCode -eq 0) `
        $(if ($buildCode -eq 0) { "Build completed successfully" } else { "Build failed" })
}

# -----------------------------------------------
# DIST
# -----------------------------------------------

Write-Host "`n--- BUILD OUTPUT ---" -ForegroundColor Cyan

$distExists = Test-Path "dist"

Check "dist directory exists" $distExists

if ($distExists) {
    Check "dist/server.cjs exists" (Test-Path "dist\server.cjs")
    Check "dist/index.html exists" (Test-Path "dist\index.html")
}

# -----------------------------------------------
# GIT
# -----------------------------------------------

Write-Host "`n--- GIT ---" -ForegroundColor Cyan

$git = Get-Command git -ErrorAction SilentlyContinue

if ($git) {
    Check "Git installed" $true $(git --version)

    if (Test-Path ".git") {
        Write-Host ""
        git status --short
    } else {
        Check "Git repository initialized" $false "No .git directory"
    }
} else {
    Check "Git installed" $false
}

# -----------------------------------------------
# FINAL SUMMARY
# -----------------------------------------------

Write-Host ""
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host " AUDIT COMPLETE" -ForegroundColor Cyan
Write-Host "===============================================" -ForegroundColor Cyan

Write-Host ""
Write-Host "IMPORTANT:" -ForegroundColor Yellow
Write-Host "A PASS here means the component exists or is configured."
Write-Host "A WARN means we need to inspect or implement that component."
Write-Host ""
Write-Host "Current known architecture:" -ForegroundColor Cyan
Write-Host "Antigravity -> Express -> InMemoryDB -> RAM"
Write-Host ""
Write-Host "Target architecture:" -ForegroundColor Cyan
Write-Host "Antigravity -> Express -> Firestore -> Google Cloud"
Write-Host ""
