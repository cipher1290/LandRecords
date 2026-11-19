
#!/usr/bin/env bash

# Org2: Revenue Department

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

if [[ -d "$SCRIPT_DIR/fabric-samples/test-network" ]]; then
    PROJECT_ROOT="$SCRIPT_DIR"
    NETWORK_DIR="$PROJECT_ROOT/fabric-samples/test-network"
elif [[ -d "$SCRIPT_DIR/organizations" && -d "$SCRIPT_DIR/channel-artifacts" ]]; then
    NETWORK_DIR="$SCRIPT_DIR"
    PROJECT_ROOT="$(cd -- "$NETWORK_DIR/../.." && pwd)"
else
    echo "ERROR: Cannot locate Fabric project from $SCRIPT_DIR" >&2
    return 1 2>/dev/null || exit 1
fi

export PROJECT_ROOT NETWORK_DIR

CHANNEL_NAME="${CHANNEL_NAME:-mychannel}"
CHAINCODE_NAME="${CHAINCODE_NAME:-land-registration}"
CHAINCODE_VERSION="${CHAINCODE_VERSION:-1.2}"
CHAINCODE_SEQUENCE="${CHAINCODE_SEQUENCE:-1}"
CHAINCODE_LABEL="${CHAINCODE_NAME}_${CHAINCODE_VERSION}"

ORDERER1_PORT="${ORDERER1_PORT:-7050}"
ORG1_PEER_PORT="${ORG1_PEER_PORT:-7051}"
ORG2_PEER_PORT="${ORG2_PEER_PORT:-9051}"
ORG3_PEER_PORT="${ORG3_PEER_PORT:-11051}"

ORGANIZATIONS_DIR="$NETWORK_DIR/organizations"

export FABRIC_CFG_PATH="$NETWORK_DIR/docker/peercfg"
export CORE_PEER_TLS_ENABLED=true

export ORDERER_CA="$ORGANIZATIONS_DIR/ordererOrganizations/example.com/orderers/orderer.example.com/tls/ca.crt"
export PEER0_ORG1_CA="$ORGANIZATIONS_DIR/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt"
export PEER0_ORG2_CA="$ORGANIZATIONS_DIR/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt"
export PEER0_ORG3_CA="$ORGANIZATIONS_DIR/peerOrganizations/org3.example.com/peers/peer0.org3.example.com/tls/ca.crt"

export CORE_PEER_LOCALMSPID="Org2MSP"
export CORE_PEER_TLS_ROOTCERT_FILE="$PEER0_ORG2_CA"
export CORE_PEER_MSPCONFIGPATH="$ORGANIZATIONS_DIR/peerOrganizations/org2.example.com/users/Admin@org2.example.com/msp"
export CORE_PEER_ADDRESS="localhost:$ORG2_PEER_PORT"

export CHANNEL_BLOCK="$NETWORK_DIR/channel-artifacts/$CHANNEL_NAME.block"
export CHAINCODE_PACKAGE="$PROJECT_ROOT/chaincode/$CHAINCODE_NAME.tar.gz"

joinChannel() {
    echo "Joining Org2 to '$CHANNEL_NAME'..."
    peer channel join -b "$CHANNEL_BLOCK"
}

installChaincode() {
    [[ -f "$CHAINCODE_PACKAGE" ]] || {
        echo "ERROR: Chaincode package not found: $CHAINCODE_PACKAGE" >&2
        return 1
    }
    peer lifecycle chaincode install "$CHAINCODE_PACKAGE"
}

getChaincodePackageId() {
    local installed
    installed="$(peer lifecycle chaincode queryinstalled)"

    CC_PACKAGE_ID="$(
        printf '%s\n' "$installed" |
        sed -n "/Label: ${CHAINCODE_LABEL//./\\.}/s/.*Package ID: \\([^,]*\\),.*/\\1/p"
    )"

    if [[ -z "$CC_PACKAGE_ID" ]]; then
        echo "ERROR: Package ID for '$CHAINCODE_LABEL' not found." >&2
        return 1
    fi
    export CC_PACKAGE_ID
}

approveChaincode() {
    local channel_id="${1:-$CHANNEL_NAME}"
    local policy="${2:-AND('Org1MSP.member','Org2MSP.member','Org3MSP.member')}"

    getChaincodePackageId

    peer lifecycle chaincode approveformyorg \
        -o "localhost:$ORDERER1_PORT" \
        --ordererTLSHostnameOverride orderer.example.com \
        --tls true \
        --cafile "$ORDERER_CA" \
        --channelID "$channel_id" \
        --name "$CHAINCODE_NAME" \
        --version "$CHAINCODE_VERSION" \
        --package-id "$CC_PACKAGE_ID" \
        --sequence "$CHAINCODE_SEQUENCE" \
        --signature-policy "$policy"
}

commitChaincode() {
    local channel_id="${1:-$CHANNEL_NAME}"
    local policy="${2:-AND('Org1MSP.member','Org2MSP.member','Org3MSP.member')}"

    peer lifecycle chaincode commit \
        -o "localhost:$ORDERER1_PORT" \
        --ordererTLSHostnameOverride orderer.example.com \
        --tls true \
        --cafile "$ORDERER_CA" \
        --channelID "$channel_id" \
        --name "$CHAINCODE_NAME" \
        --version "$CHAINCODE_VERSION" \
        --sequence "$CHAINCODE_SEQUENCE" \
        --signature-policy "$policy" \
        --peerAddresses "localhost:$ORG1_PEER_PORT" \
        --tlsRootCertFiles "$PEER0_ORG1_CA" \
        --peerAddresses "localhost:$ORG2_PEER_PORT" \
        --tlsRootCertFiles "$PEER0_ORG2_CA" \
        --peerAddresses "localhost:$ORG3_PEER_PORT" \
        --tlsRootCertFiles "$PEER0_ORG3_CA"
}

echo "Environment set for Org2 (Revenue Department)"
echo "Project root: $PROJECT_ROOT"
echo "Peer address: $CORE_PEER_ADDRESS"
echo "Channel: $CHANNEL_NAME"
