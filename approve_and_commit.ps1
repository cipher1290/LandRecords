$binPath = "e:\LandRecords\fabric-samples\bin"
$env:PATH = "$binPath;$env:PATH"
$env:FABRIC_CFG_PATH = "e:\LandRecords\fabric-samples\test-network\docker\peercfg"
$env:CORE_PEER_TLS_ENABLED = "true"

$channel = "mychannel"
$ccName = "land-registration"
$ccVer = "1.2"
$seq = "1"
$packageId = "land-registration_1.2:6f0cf1fb0ac4391a11f097a3d11a11a2bf178934d55dc420503627df40960737"
$ordererCA = "e:\LandRecords\fabric-samples\test-network\organizations\ordererOrganizations\example.com\orderers\orderer.example.com\tls\ca.crt"
$policy = "AND('Org1MSP.member','Org2MSP.member','Org3MSP.member')"

Write-Host "=== 1. Approving chaincode for Org1 ==="
$env:CORE_PEER_LOCALMSPID = "Org1MSP"
$env:CORE_PEER_TLS_ROOTCERT_FILE = "e:\LandRecords\fabric-samples\test-network\organizations\peerOrganizations\org1.example.com\peers\peer0.org1.example.com\tls\ca.crt"
$env:CORE_PEER_MSPCONFIGPATH = "e:\LandRecords\fabric-samples\test-network\organizations\peerOrganizations\org1.example.com\users\Admin@org1.example.com\msp"
$env:CORE_PEER_ADDRESS = "localhost:7051"
& "$binPath\peer.exe" lifecycle chaincode approveformyorg -o localhost:7050 --ordererTLSHostnameOverride orderer.example.com --tls true --cafile "$ordererCA" --channelID "$channel" --name "$ccName" --version "$ccVer" --package-id "$packageId" --sequence "$seq" --signature-policy "$policy"

Write-Host "=== 2. Approving chaincode for Org2 ==="
$env:CORE_PEER_LOCALMSPID = "Org2MSP"
$env:CORE_PEER_TLS_ROOTCERT_FILE = "e:\LandRecords\fabric-samples\test-network\organizations\peerOrganizations\org2.example.com\peers\peer0.org2.example.com\tls\ca.crt"
$env:CORE_PEER_MSPCONFIGPATH = "e:\LandRecords\fabric-samples\test-network\organizations\peerOrganizations\org2.example.com\users\Admin@org2.example.com\msp"
$env:CORE_PEER_ADDRESS = "localhost:9051"
& "$binPath\peer.exe" lifecycle chaincode approveformyorg -o localhost:7050 --ordererTLSHostnameOverride orderer.example.com --tls true --cafile "$ordererCA" --channelID "$channel" --name "$ccName" --version "$ccVer" --package-id "$packageId" --sequence "$seq" --signature-policy "$policy"

Write-Host "=== 3. Approving chaincode for Org3 ==="
$env:CORE_PEER_LOCALMSPID = "Org3MSP"
$env:CORE_PEER_TLS_ROOTCERT_FILE = "e:\LandRecords\fabric-samples\test-network\organizations\peerOrganizations\org3.example.com\peers\peer0.org3.example.com\tls\ca.crt"
$env:CORE_PEER_MSPCONFIGPATH = "e:\LandRecords\fabric-samples\test-network\organizations\peerOrganizations\org3.example.com\users\Admin@org3.example.com\msp"
$env:CORE_PEER_ADDRESS = "localhost:11051"
& "$binPath\peer.exe" lifecycle chaincode approveformyorg -o localhost:7050 --ordererTLSHostnameOverride orderer.example.com --tls true --cafile "$ordererCA" --channelID "$channel" --name "$ccName" --version "$ccVer" --package-id "$packageId" --sequence "$seq" --signature-policy "$policy"

Write-Host "=== 4. Check commit readiness ==="
& "$binPath\peer.exe" lifecycle chaincode checkcommitreadiness --channelID "$channel" --name "$ccName" --version "$ccVer" --sequence "$seq" --signature-policy "$policy" --output json

Write-Host "=== 5. Commit chaincode to channel ==="
$p1CA = "e:\LandRecords\fabric-samples\test-network\organizations\peerOrganizations\org1.example.com\peers\peer0.org1.example.com\tls\ca.crt"
$p2CA = "e:\LandRecords\fabric-samples\test-network\organizations\peerOrganizations\org2.example.com\peers\peer0.org2.example.com\tls\ca.crt"
$p3CA = "e:\LandRecords\fabric-samples\test-network\organizations\peerOrganizations\org3.example.com\peers\peer0.org3.example.com\tls\ca.crt"

& "$binPath\peer.exe" lifecycle chaincode commit -o localhost:7050 --ordererTLSHostnameOverride orderer.example.com --tls true --cafile "$ordererCA" --channelID "$channel" --name "$ccName" --version "$ccVer" --sequence "$seq" --signature-policy "$policy" --peerAddresses localhost:7051 --tlsRootCertFiles "$p1CA" --peerAddresses localhost:9051 --tlsRootCertFiles "$p2CA" --peerAddresses localhost:11051 --tlsRootCertFiles "$p3CA"

Write-Host "=== 6. Query committed chaincode ==="
& "$binPath\peer.exe" lifecycle chaincode querycommitted --channelID "$channel" --name "$ccName"
