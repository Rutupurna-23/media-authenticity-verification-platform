Write-Host ""
Write-Host "====================================================" -ForegroundColor Cyan
Write-Host " MEDIA AUTHENTICITY PLATFORM - PROGRESS AUDIT" -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan

$passed = 0
$total = 0

function Check {
    param(
        [string]$Name,
        [bool]$Status,
        [string]$Details = ""
    )

    $script:total++

    if ($Status) {
        $script:passed++
        Write-Host "[PASS] $Name" -ForegroundColor Green
    }
    else {
        Write-Host "[WARN] $Name" -ForegroundColor Yellow
    }

    if ($Details) {
        Write-Host "       $Details" -ForegroundColor Gray
    }
}

# ====================================================
# ENVIRONMENT
# ====================================================

Write-Host "`n--- ENVIRONMENT ---" -ForegroundColor Cyan

$gcloud = Get-Command gcloud -ErrorAction SilentlyContinue
Check "Google Cloud CLI" ($null -ne $gcloud)

$node = Get-Command node -ErrorAction SilentlyContinue
Check "Node.js" ($null -ne $node) $(if ($node) { node --version })

$npm = Get-Command npm -ErrorAction SilentlyContinue
Check "npm" ($null -ne $npm) $(if ($npm) { npm --version })

# ====================================================
# GOOGLE CLOUD PROJECT
# ====================================================

Write-Host "`n--- GOOGLE CLOUD PROJECT ---" -ForegroundColor Cyan

$project = gcloud config get-value project 2>$null
Check "Correct Google Cloud project" `
    ($project -eq "media-authenticity-platform") `
    $project

$account = gcloud config get-value account 2>$null
Check "Google account authenticated" `
    ($account -ne "" -and $account -ne "(unset)") `
    $account

# ====================================================
# BILLING
# ====================================================

Write-Host "`n--- BILLING ---" -ForegroundColor Cyan

$billing = gcloud billing projects describe media-authenticity-platform 2>$null | Out-String

$billingEnabled = $billing -match "billingEnabled:\s*true"

Check "Google Cloud billing enabled" `
    $billingEnabled `
    $(if ($billingEnabled) { "Billing enabled" } else { "Billing disabled - Cloud Storage bucket creation blocked" })

# ====================================================
# FIRESTORE
# ====================================================

Write-Host "`n--- FIRESTORE ---" -ForegroundColor Cyan

$firestore = gcloud firestore databases describe `
    --database="(default)" `
    --project="media-authenticity-platform" 2>$null | Out-String

Check "Firestore database exists" `
    ($firestore -match "FIRESTORE_NATIVE") `
    "Firestore Native database"

Check "Firestore region asia-south1" `
    ($firestore -match "asia-south1") `
    "Expected: asia-south1"

# ====================================================
# STORAGE
# ====================================================

Write-Host "`n--- GOOGLE CLOUD STORAGE ---" -ForegroundColor Cyan

$storagePackage = npm list @google-cloud/storage --depth=0 2>$null | Out-String

Check "@google-cloud/storage installed" `
    ($storagePackage -match "@google-cloud/storage")

$buckets = gcloud storage buckets list `
    --project=media-authenticity-platform 2>$null | Out-String

$bucketExists = $buckets -match "gs://"

Check "Cloud Storage bucket exists" `
    $bucketExists `
    $(if ($bucketExists) { "Bucket detected" } else { "No bucket - billing currently blocks bucket creation" })

# ====================================================
# FIREBASE ADMIN
# ====================================================

Write-Host "`n--- FIREBASE ADMIN ---" -ForegroundColor Cyan

$firebasePackage = npm list firebase-admin --depth=0 2>$null | Out-String

Check "firebase-admin installed" `
    ($firebasePackage -match "firebase-admin")

Check "Firebase initialization file" `
    (Test-Path "src\backend\firebase.ts")

# ====================================================
# DATABASE IMPLEMENTATION
# ====================================================

Write-Host "`n--- DATABASE IMPLEMENTATION ---" -ForegroundColor Cyan

$dbFile = "src\backend\db.ts"

if (Test-Path $dbFile) {

    $dbCode = Get-Content $dbFile -Raw

    $firestoreDB = $dbCode -match "firestore\.collection"

    $inMemoryDB = $dbCode -match "class InMemoryDB"

    Check "Firestore database implementation" `
        $firestoreDB `
        $(if ($firestoreDB) { "Firestore collections detected" })

    Check "Old InMemoryDB removed" `
        (-not $inMemoryDB) `
        $(if ($inMemoryDB) { "InMemoryDB still present" } else { "InMemoryDB removed" })
}

# ====================================================
# COLLECTIONS
# ====================================================

Write-Host "`n--- FIRESTORE COLLECTIONS ---" -ForegroundColor Cyan

if (Test-Path $dbFile) {

    $dbCode = Get-Content $dbFile -Raw

    Check "Institutions collection" `
        ($dbCode -match "institutions")

    Check "Credentials collection" `
        ($dbCode -match "credentials")

    Check "Media records collection" `
        ($dbCode -match "mediaRecords")

    Check "Verification logs collection" `
        ($dbCode -match "verificationLogs")
}

# ====================================================
# STORAGE IMPLEMENTATION
# ====================================================

Write-Host "`n--- STORAGE IMPLEMENTATION ---" -ForegroundColor Cyan

if (Test-Path $dbFile) {

    $dbCode = Get-Content $dbFile -Raw

    $cloudStorage = $dbCode -match "Storage|bucket\(|getFiles|file\("

    Check "Cloud Storage implementation" `
        $cloudStorage `
        $(if ($cloudStorage) { "Storage API detected" } else { "Storage migration still required" })
}

# ====================================================
# FIRESTORE SECURITY
# ====================================================

Write-Host "`n--- FIRESTORE SECURITY ---" -ForegroundColor Cyan

Check "firestore.rules exists" `
    (Test-Path "firestore.rules")

Check "firestore.indexes.json exists" `
    (Test-Path "firestore.indexes.json")

# ====================================================
# CLOUD FUNCTIONS
# ====================================================

Write-Host "`n--- CLOUD FUNCTIONS ---" -ForegroundColor Cyan

Check "Functions directory" `
    (Test-Path "functions")

Check "Functions index.ts" `
    (Test-Path "functions\src\index.ts")

# ====================================================
# APPLICATION BUILD
# ====================================================

Write-Host "`n--- APPLICATION BUILD ---" -ForegroundColor Cyan

Write-Host "Running TypeScript check..." -ForegroundColor Gray

npm run lint

$lintCode = $LASTEXITCODE

Check "TypeScript compilation" `
    ($lintCode -eq 0) `
    $(if ($lintCode -eq 0) { "No TypeScript errors" } else { "TypeScript errors found" })

Write-Host ""
Write-Host "Running production build..." -ForegroundColor Gray

npm run build

$buildCode = $LASTEXITCODE

Check "Production build" `
    ($buildCode -eq 0) `
    $(if ($buildCode -eq 0) { "Build successful" } else { "Build failed" })

# ====================================================
# BUILD OUTPUT
# ====================================================

Write-Host "`n--- BUILD OUTPUT ---" -ForegroundColor Cyan

Check "dist directory" `
    (Test-Path "dist")

Check "dist/server.cjs" `
    (Test-Path "dist\server.cjs")

Check "dist/index.html" `
    (Test-Path "dist\index.html")

# ====================================================
# GIT
# ====================================================

Write-Host "`n--- GIT ---" -ForegroundColor Cyan

$git = Get-Command git -ErrorAction SilentlyContinue

Check "Git installed" `
    ($null -ne $git)

Check "Git repository initialized" `
    (Test-Path ".git") `
    $(if (Test-Path ".git") { "Git repository found" } else { "Run git init" })

# ====================================================
# PROJECT FILES
# ====================================================

Write-Host "`n--- PROJECT STRUCTURE ---" -ForegroundColor Cyan

$requiredFiles = @(
    "package.json",
    "server.ts",
    "tsconfig.json",
    "vite.config.ts",
    "src\types.ts",
    "src\backend\db.ts",
    "src\backend\firebase.ts",
    "firestore.rules",
    "firestore.indexes.json",
    "functions\src\index.ts"
)

foreach ($file in $requiredFiles) {

    Check $file `
        (Test-Path $file) `
        $(if (Test-Path $file) { "Found" } else { "MISSING" })
}

# ====================================================
# FINAL SCORE
# ====================================================

Write-Host ""
Write-Host "====================================================" -ForegroundColor Cyan
Write-Host " PROJECT PROGRESS" -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan

$percentage = [math]::Round(($passed / $total) * 100, 1)

Write-Host ""
Write-Host "Passed : $passed / $total" -ForegroundColor Green
Write-Host "Score  : $percentage%" -ForegroundColor Yellow

Write-Host ""

if ($percentage -ge 90) {
    Write-Host "STATUS: NEAR PRODUCTION READY" -ForegroundColor Green
}
elseif ($percentage -ge 75) {
    Write-Host "STATUS: GOOD PROGRESS" -ForegroundColor Green
}
elseif ($percentage -ge 50) {
    Write-Host "STATUS: DEVELOPMENT IN PROGRESS" -ForegroundColor Yellow
}
else {
    Write-Host "STATUS: MAJOR COMPONENTS REMAIN" -ForegroundColor Red
}

Write-Host ""
Write-Host "====================================================" -ForegroundColor Cyan

Write-Host ""
Write-Host "KNOWN CURRENT ARCHITECTURE:" -ForegroundColor Cyan
Write-Host "Frontend -> Express -> Firestore -> Google Cloud"

Write-Host ""
Write-Host "REMAINING IMPORTANT WORK:" -ForegroundColor Yellow
Write-Host "1. Enable billing / create Cloud Storage bucket"
Write-Host "2. Implement Cloud Storage media upload/download"
Write-Host "3. Connect upload/verification routes to persistent storage"
Write-Host "4. Deploy/test Cloud Functions"
Write-Host "5. Initialize Git repository"
Write-Host "6. Run security and integration tests"

Write-Host ""
