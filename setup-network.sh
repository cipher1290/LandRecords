
#!/usr/bin/env bash

# Portable Hyperledger Fabric setup for LandRecords.
# Run from the project root. Existing ledger data is preserved.

set -Eeuo pipefail

# --------------------------------------------------
# 1. Resolve project paths
# --------------------------------------------------

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR"
NETWORK_DIR="$PROJECT_ROOT/fabric-samples/test-network"
COMPOSE_FILE="$NETWORK_DIR/docker/docker-compose-full.yaml"
CHANNEL_ARTIFACTS_DIR="$NETWORK_DIR/channel-artifacts"
CRYPTO_CONFIG="$NETWORK_DIR/crypto-config.yaml"

# --------------------------------------------------
# 2. Configuration
# --------------------------------------------------

CHANNEL_NAME="${CHANNEL_NAME:-mychannel}"
CHAINCODE_NAME="${CHAINCODE_NAME:-land-registration}"
CHAINCODE_VERSION="${CHAINCODE_VERSION:-1.2}"
CHAINCODE_SEQUENCE="${CHAINCODE_SEQUENCE:-1}"
FABRIC_NETWORK_NAME="${FABRIC_NETWORK_NAME:-fabric_test}"

CHAINCODE_DIR="$PROJECT_ROOT/chaincode/$CHAINCODE_NAME"
CHAINCODE_PACKAGE="$PROJECT_ROOT/chaincode/${CHAINCODE_NAME}.tar.gz"
CHAINCODE_LABEL="${CHAINCODE_NAME}_${CHAINCODE_VERSION}"

# --------------------------------------------------
# 3. Logging helpers
# --------------------------------------------------

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_status() {
    printf "${GREEN}[INFO]${NC} %s\n" "$1"
}

print_warning() {
    printf "${YELLOW}[WARN]${NC} %s\n" "$1"
}

print_error() {
    printf "${RED}[ERROR]${NC} %s\n" "$1" >&2
}

print_header() {
    printf "\n${BLUE}=== %s ===${NC}\n" "$1"
}

die() {
    print_error "$1"
    exit 1
}

# --------------------------------------------------
# 4. Prerequisites
# --------------------------------------------------

check_prerequisites() {
    print_header "Checking prerequisites"

    command -v docker >/dev/null 2>&1 ||
        die "Docker is not installed or not on PATH."

    docker info >/dev/null 2>&1 ||
        die "Docker is not running. Start Docker Desktop first."

    if docker compose version >/dev/null 2>&1; then
        COMPOSE=(docker compose)
    elif command -v docker-compose >/dev/null 2>&1; then
        COMPOSE=(docker-compose)
    else
        die "Docker Compose is not installed."
    fi

    [[ -d "$NETWORK_DIR" ]] ||
        die "Fabric test-network directory not found: $NETWORK_DIR"

    [[ -f "$COMPOSE_FILE" ]] ||
        die "Compose file not found: $COMPOSE_FILE"

    [[ -f "$CRYPTO_CONFIG" ]] ||
        die "crypto-config.yaml not found: $CRYPTO_CONFIG"

    [[ -d "$CHAINCODE_DIR" ]] ||
        die "Chaincode directory not found: $CHAINCODE_DIR"

    command -v cryptogen >/dev/null 2>&1 ||
        die "cryptogen is not on PATH. Install/use the Fabric binaries."

    command -v configtxgen >/dev/null 2>&1 ||
        die "configtxgen is not on PATH. Install/use the Fabric binaries."

    command -v osnadmin >/dev/null 2>&1 ||
        die "osnadmin is not on PATH. Install/use the Fabric binaries."

    command -v peer >/dev/null 2>&1 ||
        die "peer is not on PATH. Install/use the Fabric binaries."

    command -v node >/dev/null 2>&1 ||
        die "Node.js is required for the chaincode."

    command -v npm >/dev/null 2>&1 ||
        die "npm is required for the chaincode."

    print_status "Prerequisites check passed."
}

# --------------------------------------------------
# 5. Environment
# --------------------------------------------------

configure_environment() {
    export PATH="$PROJECT_ROOT/fabric-samples/bin:$NETWORK_DIR:$PATH"
    export FABRIC_CFG_PATH="$NETWORK_DIR"

    export FABRIC_NETWORK_NAME
    export CHANNEL_NAME
    export CHAINCODE_NAME
    export CHAINCODE_VERSION
    export CHAINCODE_SEQUENCE

    print_status "Project root: $PROJECT_ROOT"
    print_status "Fabric network directory: $NETWORK_DIR"
}

# --------------------------------------------------
# 6. Generate missing artifacts only
# --------------------------------------------------

generate_artifacts() {
    print_header "Checking crypto materials and channel artifacts"

    mkdir -p "$CHANNEL_ARTIFACTS_DIR"

    local orderer_orgs="$NETWORK_DIR/organizations/ordererOrganizations"
    local peer_orgs="$NETWORK_DIR/organizations/peerOrganizations"
    local channel_block="$CHANNEL_ARTIFACTS_DIR/${CHANNEL_NAME}.block"

    if [[ -d "$orderer_orgs" || -d "$peer_orgs" ]]; then
        if [[ ! -d "$orderer_orgs" || ! -d "$peer_orgs" ]]; then
            die "Only some crypto directories exist. Inspect organizations/ manually; refusing to regenerate identities."
        fi
        print_status "Existing organization crypto directories preserved."
    else
        print_status "Generating organization crypto materials..."
        (
            cd "$NETWORK_DIR"
            cryptogen generate \
                --config="$CRYPTO_CONFIG" \
                --output="organizations"
        )
    fi

    if [[ -f "$channel_block" ]]; then
        print_status "Existing channel block preserved: $channel_block"
    else
        print_status "Generating channel block..."
        (
            cd "$NETWORK_DIR"
            configtxgen \
                -profile ThreeOrgsChannel \
                -outputBlock "$channel_block" \
                -channelID "$CHANNEL_NAME"
        )
    fi

    print_status "Artifact check completed."
}

# --------------------------------------------------
# 7. Start containers
# --------------------------------------------------

start_network() {
    print_header "Starting Fabric containers"

    (
        cd "$NETWORK_DIR"
        "${COMPOSE[@]}" -f "$COMPOSE_FILE" up -d
    )

    print_status "Waiting for containers to initialize..."
    sleep 10

    (
        cd "$NETWORK_DIR"
        "${COMPOSE[@]}" -f "$COMPOSE_FILE" ps
    )
}

# --------------------------------------------------
# 8. Join orderers
# --------------------------------------------------

join_orderers() {
    print_header "Joining orderers to channel: $CHANNEL_NAME"

    local org_dir="$NETWORK_DIR/organizations/ordererOrganizations/example.com"
    local block_file="$CHANNEL_ARTIFACTS_DIR/${CHANNEL_NAME}.block"
    local client_cert="$org_dir/users/Admin@example.com/tls/client.crt"
    local client_key="$org_dir/users/Admin@example.com/tls/client.key"
    local entry host port tls_dir

    [[ -f "$block_file" ]] ||
        die "Channel block is missing: $block_file"

    [[ -f "$client_cert" ]] ||
        die "Missing orderer admin TLS client certificate: $client_cert"

    [[ -f "$client_key" ]] ||
        die "Missing orderer admin TLS client key: $client_key"

    for entry in \
        "orderer.example.com:7053" \
        "orderer2.example.com:8053" \
        "orderer3.example.com:9053"
    do
        host="${entry%%:*}"
        port="${entry##*:}"
        tls_dir="$org_dir/orderers/$host/tls"

        [[ -f "$tls_dir/ca.crt" ]] ||
            die "Missing orderer TLS CA certificate: $tls_dir/ca.crt"

        print_status "Joining $host through localhost:$port"

        osnadmin channel join \
            --channelID "$CHANNEL_NAME" \
            --config-block "$block_file" \
            -o "localhost:$port" \
            --ca-file "$tls_dir/ca.crt" \
            --client-cert "$client_cert" \
            --client-key "$client_key"
    done

    print_status "Orderer channel join commands completed."
}


join_peer_organizations() {
    print_header "Joining peer organizations to channel: $CHANNEL_NAME"

    for org in 1 2 3; do
        org_script="$PROJECT_ROOT/setorg${org}.sh"

        if [[ ! -f "$org_script" ]]; then
            die "Organization script not found: $org_script"
        fi

        print_status "Checking Org${org} channel membership"

        source "$org_script"

        if peer channel list 2>/dev/null | grep -Fxq "$CHANNEL_NAME"; then
            print_status "Org${org} is already joined to $CHANNEL_NAME; skipping."
        else
            print_status "Joining Org${org} to $CHANNEL_NAME"
            joinChannel
        fi
    done

    print_status "Peer organization join checks completed."
}


setup_channel() {
    join_orderers
    print_status "Waiting for orderer leader election..."
    sleep 10
    join_peer_organizations
}

# --------------------------------------------------
# 10. Package chaincode
# --------------------------------------------------

package_chaincode() {
    print_header "Packaging chaincode"

    [[ -f "$CHAINCODE_DIR/package.json" ]] ||
        die "package.json not found in $CHAINCODE_DIR"

    (
        cd "$CHAINCODE_DIR"
        npm install
    )

    (
        cd "$PROJECT_ROOT"
        peer lifecycle chaincode package "$CHAINCODE_PACKAGE" \
            --path "$CHAINCODE_DIR" \
            --lang node \
            --label "$CHAINCODE_LABEL"
    )

    print_status "Chaincode package created: $CHAINCODE_PACKAGE"
}

# --------------------------------------------------
# 11. Install, approve, and commit chaincode
# --------------------------------------------------

setup_chaincode() {
    print_header "Deploying chaincode: $CHAINCODE_NAME"

    package_chaincode

    (
        cd "$NETWORK_DIR"

        source "$PROJECT_ROOT/setorg1.sh"
        installChaincode

        source "$PROJECT_ROOT/setorg2.sh"
        installChaincode

        source "$PROJECT_ROOT/setorg3.sh"
        installChaincode

        local policy="AND('Org1MSP.member','Org2MSP.member','Org3MSP.member')"

        source "$PROJECT_ROOT/setorg1.sh"
        approveChaincode "$CHANNEL_NAME" "$policy"

        source "$PROJECT_ROOT/setorg2.sh"
        approveChaincode "$CHANNEL_NAME" "$policy"

        source "$PROJECT_ROOT/setorg3.sh"
        approveChaincode "$CHANNEL_NAME" "$policy"

        commitChaincode "$CHANNEL_NAME" "$policy"
    )

    print_status "Chaincode deployment commands completed."
}

# --------------------------------------------------
# 12. Main
# --------------------------------------------------

main() {
    print_header "Land Records - Fabric Network Setup"

    configure_environment
    check_prerequisites
    generate_artifacts
    start_network
    setup_channel
    setup_chaincode

    print_header "Setup commands completed"
    echo "Project root: $PROJECT_ROOT"
    echo "Channel: $CHANNEL_NAME"
    echo "Chaincode: $CHAINCODE_NAME"
    echo
    echo "Next steps:"
    echo "1. Verify peer and orderer container logs."
    echo "2. Verify chaincode commit on channel $CHANNEL_NAME."
    echo "3. Start the API from the fabric-api directory."
}

main "$@"
