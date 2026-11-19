#!/usr/bin/env bash
set -euo pipefail

# Convert Windows path to WSL path
PROJECT_ROOT="/mnt/e/LandRecords"
NETWORK_DIR="$PROJECT_ROOT/fabric-samples/test-network"
CHANNEL_NAME="mychannel"
CHAINCODE_NAME="land-registration"
CHAINCODE_VERSION="1.2"
CHAINCODE_SEQUENCE="1"
CHAINCODE_LABEL="${CHAINCODE_NAME}_${CHAINCODE_VERSION}"

export PATH="$PROJECT_ROOT/fabric-samples/bin:$PATH"
export FABRIC_CFG_PATH="$NETWORK_DIR/docker/peercfg"

ORGANIZATIONS_DIR="$NETWORK_DIR/organizations"
CHANNEL_BLOCK="$NETWORK_DIR/channel-artifacts/$CHANNEL_NAME.block"
CHAINCODE_DIR="$PROJECT_ROOT/chaincode/$CHAINCODE_NAME"
CHAINCODE_PACKAGE="$PROJECT_ROOT/chaincode/${CHAINCODE_NAME}.tar.gz"

# Common TLS certs
ORDERER_CA="$ORGANIZATIONS_DIR/ordererOrganizations/example.com/orderers/orderer.example.com/tls/ca.crt"
PEER0_ORG1_CA="$ORGANIZATIONS_DIR/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt"
PEER0_ORG2_CA="$ORGANIZATIONS_DIR/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt"
PEER0_ORG3_CA="$ORGANIZATIONS_DIR/peerOrganizations/org3.example.com/peers/peer0.org3.example.com/tls/ca.crt"

echo "=== Step 1: Wait for containers ==="
sleep 5

echo "=== Step 2: Join orderers to channel ==="
ORDERER_ORG_DIR="$ORGANIZATIONS_DIR/ordererOrganizations/example.com"

# Join orderer1
echo "Joining orderer.example.com..."
osnadmin channel join \
    --channelID "$CHANNEL_NAME" \
    --config-block "$CHANNEL_BLOCK" \
    -o "localhost:7053" \
    --ca-file "$ORDERER_ORG_DIR/orderers/orderer.example.com/tls/ca.crt" \
    --client-cert "$ORDERER_ORG_DIR/users/Admin@example.com/tls/client.crt" \
    --client-key "$ORDERER_ORG_DIR/users/Admin@example.com/tls/client.key" || echo "Orderer1 may already be joined"

# Join orderer2
echo "Joining orderer2.example.com..."
osnadmin channel join \
    --channelID "$CHANNEL_NAME" \
    --config-block "$CHANNEL_BLOCK" \
    -o "localhost:8053" \
    --ca-file "$ORDERER_ORG_DIR/orderers/orderer2.example.com/tls/ca.crt" \
    --client-cert "$ORDERER_ORG_DIR/users/Admin@example.com/tls/client.crt" \
    --client-key "$ORDERER_ORG_DIR/users/Admin@example.com/tls/client.key" || echo "Orderer2 may already be joined"

# Join orderer3
echo "Joining orderer3.example.com..."
osnadmin channel join \
    --channelID "$CHANNEL_NAME" \
    --config-block "$CHANNEL_BLOCK" \
    -o "localhost:9053" \
    --ca-file "$ORDERER_ORG_DIR/orderers/orderer3.example.com/tls/ca.crt" \
    --client-cert "$ORDERER_ORG_DIR/users/Admin@example.com/tls/client.crt" \
    --client-key "$ORDERER_ORG_DIR/users/Admin@example.com/tls/client.key" || echo "Orderer3 may already be joined"

echo "Waiting for orderer leader election..."
sleep 10

echo "=== Step 3: Join peers to channel ==="

# Org1
echo "Joining Org1 peer..."
export CORE_PEER_TLS_ENABLED=true
export CORE_PEER_LOCALMSPID="Org1MSP"
export CORE_PEER_TLS_ROOTCERT_FILE="$PEER0_ORG1_CA"
export CORE_PEER_MSPCONFIGPATH="$ORGANIZATIONS_DIR/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp"
export CORE_PEER_ADDRESS="localhost:7051"
peer channel join -b "$CHANNEL_BLOCK" || echo "Org1 peer may already be joined"

# Org2
echo "Joining Org2 peer..."
export CORE_PEER_LOCALMSPID="Org2MSP"
export CORE_PEER_TLS_ROOTCERT_FILE="$PEER0_ORG2_CA"
export CORE_PEER_MSPCONFIGPATH="$ORGANIZATIONS_DIR/peerOrganizations/org2.example.com/users/Admin@org2.example.com/msp"
export CORE_PEER_ADDRESS="localhost:9051"
peer channel join -b "$CHANNEL_BLOCK" || echo "Org2 peer may already be joined"

# Org3
echo "Joining Org3 peer..."
export CORE_PEER_LOCALMSPID="Org3MSP"
export CORE_PEER_TLS_ROOTCERT_FILE="$PEER0_ORG3_CA"
export CORE_PEER_MSPCONFIGPATH="$ORGANIZATIONS_DIR/peerOrganizations/org3.example.com/users/Admin@org3.example.com/msp"
export CORE_PEER_ADDRESS="localhost:11051"
peer channel join -b "$CHANNEL_BLOCK" || echo "Org3 peer may already be joined"

echo "=== Step 4: Package chaincode ==="
cd "$CHAINCODE_DIR"
npm install 2>&1 | tail -5

cd "$PROJECT_ROOT"
peer lifecycle chaincode package "$CHAINCODE_PACKAGE" \
    --path "$CHAINCODE_DIR" \
    --lang node \
    --label "$CHAINCODE_LABEL"
echo "Chaincode packaged."

echo "=== Step 5: Install chaincode on all orgs ==="

# Org1
export CORE_PEER_LOCALMSPID="Org1MSP"
export CORE_PEER_TLS_ROOTCERT_FILE="$PEER0_ORG1_CA"
export CORE_PEER_MSPCONFIGPATH="$ORGANIZATIONS_DIR/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp"
export CORE_PEER_ADDRESS="localhost:7051"
peer lifecycle chaincode install "$CHAINCODE_PACKAGE"

# Org2
export CORE_PEER_LOCALMSPID="Org2MSP"
export CORE_PEER_TLS_ROOTCERT_FILE="$PEER0_ORG2_CA"
export CORE_PEER_MSPCONFIGPATH="$ORGANIZATIONS_DIR/peerOrganizations/org2.example.com/users/Admin@org2.example.com/msp"
export CORE_PEER_ADDRESS="localhost:9051"
peer lifecycle chaincode install "$CHAINCODE_PACKAGE"

# Org3
export CORE_PEER_LOCALMSPID="Org3MSP"
export CORE_PEER_TLS_ROOTCERT_FILE="$PEER0_ORG3_CA"
export CORE_PEER_MSPCONFIGPATH="$ORGANIZATIONS_DIR/peerOrganizations/org3.example.com/users/Admin@org3.example.com/msp"
export CORE_PEER_ADDRESS="localhost:11051"
peer lifecycle chaincode install "$CHAINCODE_PACKAGE"

echo "=== Step 6: Get Package ID ==="
# Switch back to Org1 to get the package ID
export CORE_PEER_LOCALMSPID="Org1MSP"
export CORE_PEER_TLS_ROOTCERT_FILE="$PEER0_ORG1_CA"
export CORE_PEER_MSPCONFIGPATH="$ORGANIZATIONS_DIR/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp"
export CORE_PEER_ADDRESS="localhost:7051"

CC_PACKAGE_ID=$(peer lifecycle chaincode queryinstalled | sed -n "/${CHAINCODE_LABEL}/s/.*Package ID: \([^,]*\),.*/\1/p")
echo "Package ID: $CC_PACKAGE_ID"

POLICY="AND('Org1MSP.member','Org2MSP.member','Org3MSP.member')"

echo "=== Step 7: Approve chaincode for all orgs ==="

# Org1 approve
export CORE_PEER_LOCALMSPID="Org1MSP"
export CORE_PEER_TLS_ROOTCERT_FILE="$PEER0_ORG1_CA"
export CORE_PEER_MSPCONFIGPATH="$ORGANIZATIONS_DIR/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp"
export CORE_PEER_ADDRESS="localhost:7051"
peer lifecycle chaincode approveformyorg \
    -o "localhost:7050" \
    --ordererTLSHostnameOverride orderer.example.com \
    --tls true --cafile "$ORDERER_CA" \
    --channelID "$CHANNEL_NAME" \
    --name "$CHAINCODE_NAME" \
    --version "$CHAINCODE_VERSION" \
    --package-id "$CC_PACKAGE_ID" \
    --sequence "$CHAINCODE_SEQUENCE" \
    --signature-policy "$POLICY"

# Org2 approve
export CORE_PEER_LOCALMSPID="Org2MSP"
export CORE_PEER_TLS_ROOTCERT_FILE="$PEER0_ORG2_CA"
export CORE_PEER_MSPCONFIGPATH="$ORGANIZATIONS_DIR/peerOrganizations/org2.example.com/users/Admin@org2.example.com/msp"
export CORE_PEER_ADDRESS="localhost:9051"
peer lifecycle chaincode approveformyorg \
    -o "localhost:7050" \
    --ordererTLSHostnameOverride orderer.example.com \
    --tls true --cafile "$ORDERER_CA" \
    --channelID "$CHANNEL_NAME" \
    --name "$CHAINCODE_NAME" \
    --version "$CHAINCODE_VERSION" \
    --package-id "$CC_PACKAGE_ID" \
    --sequence "$CHAINCODE_SEQUENCE" \
    --signature-policy "$POLICY"

# Org3 approve
export CORE_PEER_LOCALMSPID="Org3MSP"
export CORE_PEER_TLS_ROOTCERT_FILE="$PEER0_ORG3_CA"
export CORE_PEER_MSPCONFIGPATH="$ORGANIZATIONS_DIR/peerOrganizations/org3.example.com/users/Admin@org3.example.com/msp"
export CORE_PEER_ADDRESS="localhost:11051"
peer lifecycle chaincode approveformyorg \
    -o "localhost:7050" \
    --ordererTLSHostnameOverride orderer.example.com \
    --tls true --cafile "$ORDERER_CA" \
    --channelID "$CHANNEL_NAME" \
    --name "$CHAINCODE_NAME" \
    --version "$CHAINCODE_VERSION" \
    --package-id "$CC_PACKAGE_ID" \
    --sequence "$CHAINCODE_SEQUENCE" \
    --signature-policy "$POLICY"

echo "=== Step 8: Commit chaincode ==="
peer lifecycle chaincode commit \
    -o "localhost:7050" \
    --ordererTLSHostnameOverride orderer.example.com \
    --tls true --cafile "$ORDERER_CA" \
    --channelID "$CHANNEL_NAME" \
    --name "$CHAINCODE_NAME" \
    --version "$CHAINCODE_VERSION" \
    --sequence "$CHAINCODE_SEQUENCE" \
    --signature-policy "$POLICY" \
    --peerAddresses "localhost:7051" --tlsRootCertFiles "$PEER0_ORG1_CA" \
    --peerAddresses "localhost:9051" --tlsRootCertFiles "$PEER0_ORG2_CA" \
    --peerAddresses "localhost:11051" --tlsRootCertFiles "$PEER0_ORG3_CA"

echo ""
echo "=== SETUP COMPLETE ==="
echo "All orderers, peers joined. Chaincode deployed."
