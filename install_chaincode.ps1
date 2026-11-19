$binPath = "e:\LandRecords\fabric-samples\bin"
$env:PATH = "$binPath;$env:PATH"
$env:FABRIC_CFG_PATH = "e:\LandRecords\fabric-samples\test-network\docker\peercfg"
$env:CORE_PEER_TLS_ENABLED = "true"

$packageFile = "e:\LandRecords\chaincode\land-registration.tar.gz"

Write-Host "=== 1. Installing chaincode on Org1 ==="
$env:CORE_PEER_LOCALMSPID = "Org1MSP"
$env:CORE_PEER_TLS_ROOTCERT_FILE = "e:\LandRecords\fabric-samples\test-network\organizations\peerOrganizations\org1.example.com\peers\peer0.org1.example.com\tls\ca.crt"
$env:CORE_PEER_MSPCONFIGPATH = "e:\LandRecords\fabric-samples\test-network\organizations\peerOrganizations\org1.example.com\users\Admin@org1.example.com\msp"
$env:CORE_PEER_ADDRESS = "localhost:7051"
& "$binPath\peer.exe" lifecycle chaincode install "$packageFile"

Write-Host "=== 2. Installing chaincode on Org2 ==="
$env:CORE_PEER_LOCALMSPID = "Org2MSP"
$env:CORE_PEER_TLS_ROOTCERT_FILE = "e:\LandRecords\fabric-samples\test-network\organizations\peerOrganizations\org2.example.com\peers\peer0.org2.example.com\tls\ca.crt"
$env:CORE_PEER_MSPCONFIGPATH = "e:\LandRecords\fabric-samples\test-network\organizations\peerOrganizations\org2.example.com\users\Admin@org2.example.com\msp"
$env:CORE_PEER_ADDRESS = "localhost:9051"
& "$binPath\peer.exe" lifecycle chaincode install "$packageFile"

Write-Host "=== 3. Installing chaincode on Org3 ==="
$env:CORE_PEER_LOCALMSPID = "Org3MSP"
$env:CORE_PEER_TLS_ROOTCERT_FILE = "e:\LandRecords\fabric-samples\test-network\organizations\peerOrganizations\org3.example.com\peers\peer0.org3.example.com\tls\ca.crt"
$env:CORE_PEER_MSPCONFIGPATH = "e:\LandRecords\fabric-samples\test-network\organizations\peerOrganizations\org3.example.com\users\Admin@org3.example.com\msp"
$env:CORE_PEER_ADDRESS = "localhost:11051"
& "$binPath\peer.exe" lifecycle chaincode install "$packageFile"

Write-Host "=== 4. Querying installed package ID ==="
$env:CORE_PEER_LOCALMSPID = "Org1MSP"
$env:CORE_PEER_TLS_ROOTCERT_FILE = "e:\LandRecords\fabric-samples\test-network\organizations\peerOrganizations\org1.example.com\peers\peer0.org1.example.com\tls\ca.crt"
$env:CORE_PEER_MSPCONFIGPATH = "e:\LandRecords\fabric-samples\test-network\organizations\peerOrganizations\org1.example.com\users\Admin@org1.example.com\msp"
$env:CORE_PEER_ADDRESS = "localhost:7051"
& "$binPath\peer.exe" lifecycle chaincode queryinstalled
