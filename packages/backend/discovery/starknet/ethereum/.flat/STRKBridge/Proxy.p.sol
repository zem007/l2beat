library Addresses {
    /*
      Note: isContract function has some known limitation.
      See https://github.com/OpenZeppelin/
      openzeppelin-contracts/blob/master/contracts/utils/Address.sol.
    */
    function isContract(address account) internal view returns (bool) {
        uint256 size;
        assembly {
            size := extcodesize(account)
        }
        return size > 0;
    }

    function performEthTransfer(address recipient, uint256 amount) internal {
        if (amount == 0) return;
        (bool success, ) = recipient.call{value: amount}(""); // NOLINT: low-level-calls.
        require(success, "ETH_TRANSFER_FAILED");
    }

    /*
      Safe wrapper around ERC20/ERC721 calls.
      This is required because many deployed ERC20 contracts don't return a value.
      See https://github.com/ethereum/solidity/issues/4116.
    */
    function safeTokenContractCall(address tokenAddress, bytes memory callData) internal {
        require(isContract(tokenAddress), "BAD_TOKEN_ADDRESS");
        // NOLINTNEXTLINE: low-level-calls.
        (bool success, bytes memory returndata) = tokenAddress.call(callData);
        require(success, string(returndata));

        if (returndata.length > 0) {
            require(abi.decode(returndata, (bool)), "TOKEN_OPERATION_FAILED");
        }
    }
}

library RolesLib {
    // INITIALIZERS.
    function governanceRolesInitialized() internal view returns (bool) {
        return AccessControl.getRoleAdmin(GOVERNANCE_ADMIN) != bytes32(0x00);
    }

    function securityRolesInitialized() internal view returns (bool) {
        return AccessControl.getRoleAdmin(SECURITY_ADMIN) != bytes32(0x00);
    }

    function initialize() internal {
        address provisional = AccessControl._msgSender();
        initialize(provisional, provisional);
    }

    function initialize(address provisionalGovernor, address provisionalSecAdmin) internal {
        if (governanceRolesInitialized()) {
            // Support Proxied contract initialization.
            // In case the Proxy already initialized the roles,
            // init will succeed IFF the provisionalGovernor is already `GovernanceAdmin`.
            require(
                AccessControl.hasRole(GOVERNANCE_ADMIN, provisionalGovernor),
                "ROLES_ALREADY_INITIALIZED"
            );
        } else {
            initGovernanceRoles(provisionalGovernor);
        }

        if (securityRolesInitialized()) {
            // If SecurityAdmin initialized,
            // then provisionalSecAdmin must already be a `SecurityAdmin`.
            // If it's not initilized - initialize it.
            require(
                AccessControl.hasRole(SECURITY_ADMIN, provisionalSecAdmin),
                "SECURITY_ROLES_ALREADY_INITIALIZED"
            );
        } else {
            initSecurityRoles(provisionalSecAdmin);
        }
    }

    function initSecurityRoles(address provisionalSecAdmin) private {
        AccessControl._setRoleAdmin(SECURITY_ADMIN, SECURITY_ADMIN);
        AccessControl._setRoleAdmin(SECURITY_AGENT, SECURITY_ADMIN);
        AccessControl._grantRole(SECURITY_ADMIN, provisionalSecAdmin);
    }

    function initGovernanceRoles(address provisionalGovernor) private {
        AccessControl._grantRole(GOVERNANCE_ADMIN, provisionalGovernor);
        AccessControl._setRoleAdmin(APP_GOVERNOR, APP_ROLE_ADMIN);
        AccessControl._setRoleAdmin(APP_ROLE_ADMIN, GOVERNANCE_ADMIN);
        AccessControl._setRoleAdmin(GOVERNANCE_ADMIN, GOVERNANCE_ADMIN);
        AccessControl._setRoleAdmin(OPERATOR, APP_ROLE_ADMIN);
        AccessControl._setRoleAdmin(TOKEN_ADMIN, APP_ROLE_ADMIN);
        AccessControl._setRoleAdmin(UPGRADE_GOVERNOR, GOVERNANCE_ADMIN);
    }
}

library Strings {
    bytes16 private constant _HEX_SYMBOLS = "0123456789abcdef";
    uint8 private constant _ADDRESS_LENGTH = 20;

    /**
     * @dev Converts a `uint256` to its ASCII `string` decimal representation.
     */
    function toString(uint256 value) internal pure returns (string memory) {
        // Inspired by OraclizeAPI's implementation - MIT licence
        // https://github.com/oraclize/ethereum-api/blob/b42146b063c7d6ee1358846c198246239e9360e8/oraclizeAPI_0.4.25.sol

        if (value == 0) {
            return "0";
        }
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }

    /**
     * @dev Converts a `uint256` to its ASCII `string` hexadecimal representation.
     */
    function toHexString(uint256 value) internal pure returns (string memory) {
        if (value == 0) {
            return "0x00";
        }
        uint256 temp = value;
        uint256 length = 0;
        while (temp != 0) {
            length++;
            temp >>= 8;
        }
        return toHexString(value, length);
    }

    /**
     * @dev Converts a `uint256` to its ASCII `string` hexadecimal representation with fixed length.
     */
    function toHexString(uint256 value, uint256 length) internal pure returns (string memory) {
        bytes memory buffer = new bytes(2 * length + 2);
        buffer[0] = "0";
        buffer[1] = "x";
        for (uint256 i = 2 * length + 1; i > 1; --i) {
            buffer[i] = _HEX_SYMBOLS[value & 0xf];
            value >>= 4;
        }
        require(value == 0, "Strings: hex length insufficient");
        return string(buffer);
    }

    /**
     * @dev Converts an `address` with fixed length of 20 bytes to its not checksummed ASCII `string` hexadecimal representation.
     */
    function toHexString(address addr) internal pure returns (string memory) {
        return toHexString(uint256(uint160(addr)), _ADDRESS_LENGTH);
    }
}

library AccessControl {
    /*
      Emitted when `newAdminRole` is set as ``role``'s admin role, replacing `previousAdminRole`
     
      `DEFAULT_ADMIN_ROLE` is the starting admin for all roles, despite
      {RoleAdminChanged} not being emitted signaling this.
     
      Available since v3.1.
    */
    event RoleAdminChanged(
        bytes32 indexed role,
        bytes32 indexed previousAdminRole,
        bytes32 indexed newAdminRole
    );

    /*
      Emitted when `account` is granted `role`.
     
      `sender` is the account that originated the contract call, an admin role
      bearer except when using {AccessControl-_setupRole}.
    */
    event RoleGranted(bytes32 indexed role, address indexed account, address indexed sender);

    /*
      Emitted when `account` is revoked `role`.
     
      `sender` is the account that originated the contract call:
        - if using `revokeRole`, it is the admin role bearer
        - if using `renounceRole`, it is the role bearer (i.e. `account`).
    */
    event RoleRevoked(bytes32 indexed role, address indexed account, address indexed sender);

    struct RoleData {
        mapping(address => bool) members;
        bytes32 adminRole;
    }

    // Context interface functions.
    function _msgSender() internal view returns (address) {
        return msg.sender;
    }

    function _msgData() internal pure returns (bytes calldata) {
        return msg.data;
    }

    // The storage variable `_roles` is located away from the contract linear area (low storage addresses)
    // to prevent potential collision/corruption in upgrade scenario.
    // Slot = Web3.keccak(text="AccesControl_Storage_Slot").
    bytes32 constant rolesSlot = 0x53e43b954ba190a7e49386f1f78b01dcd9f628db23f432fa029a7dfd6d98e8fb;

    function _roles() private pure returns (mapping(bytes32 => RoleData) storage roles) {
        assembly {
            roles.slot := rolesSlot
        }
    }

    bytes32 constant DEFAULT_ADMIN_ROLE = 0x00;

    /*
      Modifier that checks that an account has a specific role. Reverts
      with a standardized message including the required role.
      
      The format of the revert reason is given by the following regular expression:
      
      /^AccessControl: account (0x[0-9a-f]{40}) is missing role (0x[0-9a-f]{64})$/
      
      Available since v4.1.
    */
    modifier onlyRole(bytes32 role) {
        _checkRole(role);
        _;
    }

    /*
      Returns `true` if `account` has been granted `role`.
    */
    function hasRole(bytes32 role, address account) internal view returns (bool) {
        return _roles()[role].members[account];
    }

    /*
      Revert with a standard message if `_msgSender()` is missing `role`.
      Overriding this function changes the behavior of the {onlyRole} modifier.
     
      Format of the revert message is described in {_checkRole}.
     
      Available since v4.6.
    */
    function _checkRole(bytes32 role) internal view {
        _checkRole(role, _msgSender());
    }

    /*
      Revert with a standard message if `account` is missing `role`.
     
      The format of the revert reason is given by the following regular expression:
     
       /^AccessControl: account (0x[0-9a-f]{40}) is missing role (0x[0-9a-f]{64})$/.
    */
    function _checkRole(bytes32 role, address account) internal view {
        if (!hasRole(role, account)) {
            revert(
                string(
                    abi.encodePacked(
                        "AccessControl: account ",
                        Strings.toHexString(uint160(account), 20),
                        " is missing role ",
                        Strings.toHexString(uint256(role), 32)
                    )
                )
            );
        }
    }

    /*
      Returns the admin role that controls `role`. See {grantRole} and
      {revokeRole}.
     
      To change a role's admin, use {_setRoleAdmin}.
    */
    function getRoleAdmin(bytes32 role) internal view returns (bytes32) {
        return _roles()[role].adminRole;
    }

    /*
      Grants `role` to `account`.
     
      If `account` had not been already granted `role`, emits a {RoleGranted}
      event.
     
      Requirements:
     
      - the caller must have ``role``'s admin role.
     
      May emit a {RoleGranted} event.
    */
    function grantRole(bytes32 role, address account) internal onlyRole(getRoleAdmin(role)) {
        _grantRole(role, account);
    }

    /*
      Revokes `role` from `account`.
     
      If `account` had been granted `role`, emits a {RoleRevoked} event.
     
      Requirements:
     
      - the caller must have ``role``'s admin role.
     
      * May emit a {RoleRevoked} event.
    */
    function revokeRole(bytes32 role, address account) internal onlyRole(getRoleAdmin(role)) {
        _revokeRole(role, account);
    }

    /*
      Revokes `role` from the calling account.
     
      Roles are often managed via {grantRole} and {revokeRole}: this function's
      purpose is to provide a mechanism for accounts to lose their privileges
      if they are compromised (such as when a trusted device is misplaced).
     
      If the calling account had been revoked `role`, emits a {RoleRevoked}
      event.
     
      Requirements:
     
      - the caller must be `account`.
     
      May emit a {RoleRevoked} event.
    */
    function renounceRole(bytes32 role, address account) internal {
        require(account == _msgSender(), "AccessControl: can only renounce roles for self");

        _revokeRole(role, account);
    }

    /*
      Grants `role` to `account`.
     
      If `account` had not been already granted `role`, emits a {RoleGranted}
      event. Note that unlike {grantRole}, this function doesn't perform any
      checks on the calling account.
     
      May emit a {RoleGranted} event.
     
      [WARNING]virtual
      ====
      This function should only be called from the constructor when setting
      up the initial roles for the system.
     
      Using this function in any other way is effectively circumventing the admin
      system imposed by {AccessControl}.
      ====
     
      NOTE: This function is deprecated in favor of {_grantRole}.
    */
    function _setupRole(bytes32 role, address account) internal {
        _grantRole(role, account);
    }

    /*
      Sets `adminRole` as ``role``'s admin role.
     
      Emits a {RoleAdminChanged} event.
    */
    function _setRoleAdmin(bytes32 role, bytes32 adminRole) internal {
        bytes32 previousAdminRole = getRoleAdmin(role);
        _roles()[role].adminRole = adminRole;
        emit RoleAdminChanged(role, previousAdminRole, adminRole);
    }

    /*
      Grants `role` to `account`.
     
      Internal function without access restriction.
     
      May emit a {RoleGranted} event.
    */
    function _grantRole(bytes32 role, address account) internal {
        if (!hasRole(role, account)) {
            _roles()[role].members[account] = true;
            emit RoleGranted(role, account, _msgSender());
        }
    }

    /*
      Revokes `role` from `account`.
     
      Internal function without access restriction.
     
      May emit a {RoleRevoked} event.
    */
    function _revokeRole(bytes32 role, address account) internal {
        if (hasRole(role, account)) {
            _roles()[role].members[account] = false;
            emit RoleRevoked(role, account, _msgSender());
        }
    }
}

abstract contract Roles {
    // This flag dermine if the GOVERNANCE_ADMIN role can be renounced.
    bool immutable fullyRenouncable;

    constructor(bool renounceable) {
        fullyRenouncable = renounceable;
        RolesLib.initialize();
    }

    // MODIFIERS.
    modifier onlyAppGovernor() {
        require(isAppGovernor(AccessControl._msgSender()), "ONLY_APP_GOVERNOR");
        _;
    }

    modifier onlyOperator() {
        require(isOperator(AccessControl._msgSender()), "ONLY_OPERATOR");
        _;
    }

    modifier onlySecurityAdmin() {
        require(isSecurityAdmin(AccessControl._msgSender()), "ONLY_SECURITY_ADMIN");
        _;
    }

    modifier onlySecurityAgent() {
        require(isSecurityAgent(AccessControl._msgSender()), "ONLY_SECURITY_AGENT");
        _;
    }

    modifier onlyTokenAdmin() {
        require(isTokenAdmin(AccessControl._msgSender()), "ONLY_TOKEN_ADMIN");
        _;
    }

    modifier onlyUpgradeGovernor() {
        require(isUpgradeGovernor(AccessControl._msgSender()), "ONLY_UPGRADE_GOVERNOR");
        _;
    }

    modifier notSelf(address account) {
        require(account != AccessControl._msgSender(), "CANNOT_PERFORM_ON_SELF");
        _;
    }

    // Is holding role.
    function isAppGovernor(address account) public view returns (bool) {
        return AccessControl.hasRole(APP_GOVERNOR, account);
    }

    function isAppRoleAdmin(address account) public view returns (bool) {
        return AccessControl.hasRole(APP_ROLE_ADMIN, account);
    }

    function isGovernanceAdmin(address account) public view returns (bool) {
        return AccessControl.hasRole(GOVERNANCE_ADMIN, account);
    }

    function isOperator(address account) public view returns (bool) {
        return AccessControl.hasRole(OPERATOR, account);
    }

    function isSecurityAdmin(address account) public view returns (bool) {
        return AccessControl.hasRole(SECURITY_ADMIN, account);
    }

    function isSecurityAgent(address account) public view returns (bool) {
        return AccessControl.hasRole(SECURITY_AGENT, account);
    }

    function isTokenAdmin(address account) public view returns (bool) {
        return AccessControl.hasRole(TOKEN_ADMIN, account);
    }

    function isUpgradeGovernor(address account) public view returns (bool) {
        return AccessControl.hasRole(UPGRADE_GOVERNOR, account);
    }

    // Register Role.
    function registerAppGovernor(address account) external {
        AccessControl.grantRole(APP_GOVERNOR, account);
    }

    function registerAppRoleAdmin(address account) external {
        AccessControl.grantRole(APP_ROLE_ADMIN, account);
    }

    function registerGovernanceAdmin(address account) external {
        AccessControl.grantRole(GOVERNANCE_ADMIN, account);
    }

    function registerOperator(address account) external {
        AccessControl.grantRole(OPERATOR, account);
    }

    function registerSecurityAdmin(address account) external {
        AccessControl.grantRole(SECURITY_ADMIN, account);
    }

    function registerSecurityAgent(address account) external {
        AccessControl.grantRole(SECURITY_AGENT, account);
    }

    function registerTokenAdmin(address account) external {
        AccessControl.grantRole(TOKEN_ADMIN, account);
    }

    function registerUpgradeGovernor(address account) external {
        AccessControl.grantRole(UPGRADE_GOVERNOR, account);
    }

    // Revoke Role.
    function revokeAppGovernor(address account) external {
        AccessControl.revokeRole(APP_GOVERNOR, account);
    }

    function revokeAppRoleAdmin(address account) external notSelf(account) {
        AccessControl.revokeRole(APP_ROLE_ADMIN, account);
    }

    function revokeGovernanceAdmin(address account) external notSelf(account) {
        AccessControl.revokeRole(GOVERNANCE_ADMIN, account);
    }

    function revokeOperator(address account) external {
        AccessControl.revokeRole(OPERATOR, account);
    }

    function revokeSecurityAdmin(address account) external notSelf(account) {
        AccessControl.revokeRole(SECURITY_ADMIN, account);
    }

    function revokeSecurityAgent(address account) external {
        AccessControl.revokeRole(SECURITY_AGENT, account);
    }

    function revokeTokenAdmin(address account) external {
        AccessControl.revokeRole(TOKEN_ADMIN, account);
    }

    function revokeUpgradeGovernor(address account) external {
        AccessControl.revokeRole(UPGRADE_GOVERNOR, account);
    }

    // Renounce Role.
    function renounceRole(bytes32 role, address account) external {
        if (role == GOVERNANCE_ADMIN && !fullyRenouncable) {
            revert("CANNOT_RENOUNCE_GOVERNANCE_ADMIN");
        }
        AccessControl.renounceRole(role, account);
    }
}

contract StorageSlots {
    // Storage slot with the address of the current implementation.
    // We need to keep this variable stored outside of the commonly used space,
    // so that it's not overrun by the logical implementation (the proxied contract).
    // Web3.keccak(text="StarkWare2019.implemntation-slot").
    bytes32 internal constant IMPLEMENTATION_SLOT =
        0x177667240aeeea7e35eabe3a35e18306f336219e1386f7710a6bf8783f761b24;

    // Storage slot with the address of the call-proxy current implementation.
    // We need to keep this variable stored outside of the commonly used space.
    // so that it's not overrun by the logical implementation (the proxied contract).
    // Web3.keccak(text="StarkWare2020.CallProxy.Implemntation.Slot").
    bytes32 internal constant CALL_PROXY_IMPL_SLOT =
        0x7184681641399eb4ad2fdb92114857ee6ff239f94ad635a1779978947b8843be;

    // This storage slot stores the finalization flag.
    // Once the value stored in this slot is set to non-zero
    // the proxy blocks implementation upgrades.
    // The current implementation is then referred to as Finalized.
    // Web3.keccak(text="StarkWare2019.finalization-flag-slot").
    bytes32 internal constant FINALIZED_STATE_SLOT =
        0x7d433c6f837e8f93009937c466c82efbb5ba621fae36886d0cac433c5d0aa7d2;

    // Storage slot to hold the upgrade delay (time-lock).
    // The intention of this slot is to allow modification using an EIC.
    // Web3.keccak(text="StarkWare.Upgradibility.Delay.Slot").
    bytes32 public constant UPGRADE_DELAY_SLOT =
        0xc21dbb3089fcb2c4f4c6a67854ab4db2b0f233ea4b21b21f912d52d18fc5db1f;

    // Storage slot to hold the upgrade eanbled duration in seconds.
    // The intention of this slot is to allow modification using an EIC.
    // Web3.keccak(text="StarkWare.Upgradibility.EnableWindowDuration.Slot").
    bytes32 public constant ENABLE_WINDOW_DURATION_SLOT =
        0xb00a6109e73dbe7bbf8d3f18fb9221d2d024dc2671e3d5ff02532ccc40590738;
}

library NamedStorage {
    function bytes32ToBoolMapping(string memory tag_)
        internal
        pure
        returns (mapping(bytes32 => bool) storage randomVariable)
    {
        bytes32 location = keccak256(abi.encodePacked(tag_));
        assembly {
            randomVariable.slot := location
        }
    }

    function bytes32ToUint256Mapping(string memory tag_)
        internal
        pure
        returns (mapping(bytes32 => uint256) storage randomVariable)
    {
        bytes32 location = keccak256(abi.encodePacked(tag_));
        assembly {
            randomVariable.slot := location
        }
    }

    function addressToUint256Mapping(string memory tag_)
        internal
        pure
        returns (mapping(address => uint256) storage randomVariable)
    {
        bytes32 location = keccak256(abi.encodePacked(tag_));
        assembly {
            randomVariable.slot := location
        }
    }

    function bytes32ToAddressMapping(string memory tag_)
        internal
        pure
        returns (mapping(bytes32 => address) storage randomVariable)
    {
        bytes32 location = keccak256(abi.encodePacked(tag_));
        assembly {
            randomVariable.slot := location
        }
    }

    function uintToAddressMapping(string memory tag_)
        internal
        pure
        returns (mapping(uint256 => address) storage randomVariable)
    {
        bytes32 location = keccak256(abi.encodePacked(tag_));
        assembly {
            randomVariable.slot := location
        }
    }

    function addressToAddressMapping(string memory tag_)
        internal
        pure
        returns (mapping(address => address) storage randomVariable)
    {
        bytes32 location = keccak256(abi.encodePacked(tag_));
        assembly {
            randomVariable.slot := location
        }
    }

    function addressToAddressListMapping(string memory tag_)
        internal
        pure
        returns (mapping(address => address[]) storage randomVariable)
    {
        bytes32 location = keccak256(abi.encodePacked(tag_));
        assembly {
            randomVariable.slot := location
        }
    }

    function addressToBoolMapping(string memory tag_)
        internal
        pure
        returns (mapping(address => bool) storage randomVariable)
    {
        bytes32 location = keccak256(abi.encodePacked(tag_));
        assembly {
            randomVariable.slot := location
        }
    }

    function getUintValue(string memory tag_) internal view returns (uint256 retVal) {
        bytes32 slot = keccak256(abi.encodePacked(tag_));
        assembly {
            retVal := sload(slot)
        }
    }

    function setUintValue(string memory tag_, uint256 value) internal {
        bytes32 slot = keccak256(abi.encodePacked(tag_));
        assembly {
            sstore(slot, value)
        }
    }

    function setUintValueOnce(string memory tag_, uint256 value) internal {
        require(getUintValue(tag_) == 0, "ALREADY_SET");
        setUintValue(tag_, value);
    }

    function getAddressValue(string memory tag_) internal view returns (address retVal) {
        bytes32 slot = keccak256(abi.encodePacked(tag_));
        assembly {
            retVal := sload(slot)
        }
    }

    function setAddressValue(string memory tag_, address value) internal {
        bytes32 slot = keccak256(abi.encodePacked(tag_));
        assembly {
            sstore(slot, value)
        }
    }

    function setAddressValueOnce(string memory tag_, address value) internal {
        require(getAddressValue(tag_) == address(0x0), "ALREADY_SET");
        setAddressValue(tag_, value);
    }

    function getBoolValue(string memory tag_) internal view returns (bool retVal) {
        bytes32 slot = keccak256(abi.encodePacked(tag_));
        assembly {
            retVal := sload(slot)
        }
    }

    function setBoolValue(string memory tag_, bool value) internal {
        bytes32 slot = keccak256(abi.encodePacked(tag_));
        assembly {
            sstore(slot, value)
        }
    }
}

contract ProxyStorage {
    // Random storage slot tags.
    string constant ENABLED_TIME_TAG = "PROXY_5_ENABLED_TIME";
    string constant DISABLED_TIME_TAG = "PROXY_5_DISABLED_TIME";
    string constant INTIALIZED_TAG = "PROXY_5_INITIALIZED";

    // The time after which we can switch to the implementation.
    // Hash(implementation, data, finalize) => time.
    function enabledTime() internal pure returns (mapping(bytes32 => uint256) storage) {
        return NamedStorage.bytes32ToUint256Mapping(ENABLED_TIME_TAG);
    }

    // The time after which we can NO LONGER switch to the implementation.
    // Implementation is valid to switch in time t,  enableTime <= t  <= disableTime.
    // Hash(implementation, data, finalize) => time.
    function expirationTime() internal pure returns (mapping(bytes32 => uint256) storage) {
        return NamedStorage.bytes32ToUint256Mapping(DISABLED_TIME_TAG);
    }

    // A central storage of the flags whether implementation has been initialized.
    // Note - it can be used flexibly enough to accommodate multiple levels of initialization
    // (i.e. using different key salting schemes for different initialization levels).
    function initialized() internal pure returns (mapping(bytes32 => bool) storage) {
        return NamedStorage.bytes32ToBoolMapping(INTIALIZED_TAG);
    }
}

contract Proxy is ProxyStorage, StorageSlots, Roles {
    // Emitted when the active implementation is replaced.
    event ImplementationUpgraded(address indexed implementation, bytes initializer);

    // Emitted when an implementation is submitted as an upgrade candidate and a time lock
    // is activated.
    event ImplementationAdded(address indexed implementation, bytes initializer, bool finalize);

    // Emitted when an implementation is removed from the list of upgrade candidates.
    event ImplementationRemoved(address indexed implementation, bytes initializer, bool finalize);

    // Emitted when the implementation is finalized.
    event FinalizedImplementation(address indexed implementation);

    using Addresses for address;

    uint256 public constant MAX_UPGRADE_DELAY = 180 days;

    string public constant PROXY_VERSION = "5.0.0";

    // Initialize Roles(false) so that we cannot renounce governance.
    constructor(uint256 upgradeActivationDelay) Roles(false) {
        setUpgradeActivationDelay(upgradeActivationDelay);
        setEnableWindowDuration(14 days);
    }

    /*
      Stores the upgrade activation delay (in seconds) in the appropriate slot.
      this function does not validate the delay value, as it's checked in the getter.
    */
    function setUpgradeActivationDelay(uint256 delayInSeconds) private {
        bytes32 slot = UPGRADE_DELAY_SLOT;
        assembly {
            sstore(slot, delayInSeconds)
        }
    }

    /*
      Reads the upgrade activation delay (in seconds) at the appropriate slot.
      The returned value is capped at MAX_UPGRADE_DELAY.
      It is safer to do the capping in the getter because an upgrade
      flow might modify this value without going through the setter function.
    */
    function getUpgradeActivationDelay() public view returns (uint256 delay) {
        bytes32 slot = UPGRADE_DELAY_SLOT;
        assembly {
            delay := sload(slot)
        }

        delay = (delay < MAX_UPGRADE_DELAY) ? delay : MAX_UPGRADE_DELAY;
        return delay;
    }

    function getEnableWindowDuration() public view returns (uint256 duration) {
        bytes32 slot = ENABLE_WINDOW_DURATION_SLOT;
        assembly {
            duration := sload(slot)
        }
    }

    function setEnableWindowDuration(uint256 durationInSeconds) private {
        bytes32 slot = ENABLE_WINDOW_DURATION_SLOT;
        assembly {
            sstore(slot, durationInSeconds)
        }
    }

    /*
      Returns the address of the current implementation.
    */
    // NOLINTNEXTLINE external-function.
    function implementation() public view returns (address _implementation) {
        bytes32 slot = IMPLEMENTATION_SLOT;
        assembly {
            _implementation := sload(slot)
        }
    }

    /*
      Returns true if the implementation is frozen.
      If the implementation was not assigned yet, returns false.
    */
    function implementationIsFrozen() private returns (bool) {
        address _implementation = implementation();

        // We can't call low level implementation before it's assigned. (i.e. ZERO).
        if (_implementation == address(0x0)) {
            return false;
        }

        // NOLINTNEXTLINE: low-level-calls.
        (bool success, bytes memory returndata) = _implementation.delegatecall(
            abi.encodeWithSignature("isFrozen()")
        );
        require(success, string(returndata));
        return abi.decode(returndata, (bool));
    }

    /*
      This method blocks delegation to initialize().
      Only upgradeTo should be able to delegate call to initialize().
    */
    function initialize(
        bytes calldata /*data*/
    ) external pure {
        revert("CANNOT_CALL_INITIALIZE");
    }

    modifier notFinalized() {
        require(isNotFinalized(), "IMPLEMENTATION_FINALIZED");
        _;
    }

    /*
      Forbids calling the function if the implementation is frozen.
      This modifier relies on the lower level (logical contract) implementation of isFrozen().
    */
    modifier notFrozen() {
        require(!implementationIsFrozen(), "STATE_IS_FROZEN");
        _;
    }

    /*
      This entry point serves only transactions with empty calldata. (i.e. pure value transfer tx).
      We don't expect to receive such, thus block them.
    */
    receive() external payable {
        revert("CONTRACT_NOT_EXPECTED_TO_RECEIVE");
    }

    /*
      Contract's default function. Delegates execution to the implementation contract.
      It returns back to the external caller whatever the implementation delegated code returns.
    */
    fallback() external payable {
        address _implementation = implementation();
        require(_implementation != address(0x0), "MISSING_IMPLEMENTATION");

        assembly {
            // Copy msg.data. We take full control of memory in this inline assembly
            // block because it will not return to Solidity code. We overwrite the
            // Solidity scratch pad at memory position 0.
            calldatacopy(0, 0, calldatasize())

            // Call the implementation.
            // out and outsize are 0 for now, as we don't know the out size yet.
            let result := delegatecall(gas(), _implementation, 0, calldatasize(), 0, 0)

            // Copy the returned data.
            returndatacopy(0, 0, returndatasize())

            // TODO(Remo): Find a way to properly propagae inner OOG error.
            switch result
            // delegatecall returns 0 on error.
            case 0 {
                revert(0, returndatasize())
            }
            default {
                return(0, returndatasize())
            }
        }
    }

    /*
      Sets the implementation address of the proxy.
    */
    function setImplementation(address newImplementation) private {
        bytes32 slot = IMPLEMENTATION_SLOT;
        assembly {
            sstore(slot, newImplementation)
        }
    }

    /*
      Returns true if the contract is not in the finalized state.
    */
    function isNotFinalized() public view returns (bool notFinal) {
        bytes32 slot = FINALIZED_STATE_SLOT;
        uint256 slotValue;
        assembly {
            slotValue := sload(slot)
        }
        notFinal = (slotValue == 0);
    }

    /*
      Marks the current implementation as finalized.
    */
    function setFinalizedFlag() private {
        bytes32 slot = FINALIZED_STATE_SLOT;
        assembly {
            sstore(slot, 0x1)
        }
    }

    /*
      Introduce an implementation and its initialization vector,
      and start the time-lock before it can be upgraded to.
      addImplementation is not blocked when frozen or finalized.
      (upgradeTo API is blocked when finalized or frozen).
    */
    function addImplementation(
        address newImplementation,
        bytes calldata data,
        bool finalize
    ) external onlyUpgradeGovernor {
        require(newImplementation.isContract(), "ADDRESS_NOT_CONTRACT");

        bytes32 implVectorHash = keccak256(abi.encode(newImplementation, data, finalize));

        uint256 activationTime = block.timestamp + getUpgradeActivationDelay();
        uint256 lastActivationTime = activationTime + getEnableWindowDuration();

        enabledTime()[implVectorHash] = activationTime;
        expirationTime()[implVectorHash] = lastActivationTime;
        emit ImplementationAdded(newImplementation, data, finalize);
    }

    /*
      Removes a candidate implementation.
      Note that it is possible to remove the current implementation. Doing so doesn't affect the
      current implementation, but rather revokes it as a future candidate.
    */
    function removeImplementation(
        address removedImplementation,
        bytes calldata data,
        bool finalize
    ) external onlyUpgradeGovernor {
        bytes32 implVectorHash = keccak256(abi.encode(removedImplementation, data, finalize));

        // If we have initializer, we set the hash of it.
        uint256 activationTime = enabledTime()[implVectorHash];
        require(activationTime > 0, "UNKNOWN_UPGRADE_INFORMATION");
        delete enabledTime()[implVectorHash];
        delete expirationTime()[implVectorHash];
        emit ImplementationRemoved(removedImplementation, data, finalize);
    }

    /*
      Upgrades the proxy to a new implementation, with its initialization.
      to upgrade successfully, implementation must have been added time-lock agreeably
      before, and the init vector must be identical ot the one submitted before.

      Upon assignment of new implementation address,
      its initialize will be called with the initializing vector (even if empty).
      Therefore, the implementation MUST must have such a method.

      Note - Initialization data is committed to in advance, therefore it must remain valid
      until the actual contract upgrade takes place.

      Care should be taken regarding initialization data and flow when planning the contract upgrade.

      When planning contract upgrade, special care is also needed with regard to governance
      (See comments in Governance.sol).
    */
    // NOLINTNEXTLINE: reentrancy-events timestamp.
    function upgradeTo(
        address newImplementation,
        bytes calldata data,
        bool finalize
    ) external payable onlyUpgradeGovernor notFinalized notFrozen {
        bytes32 implVectorHash = keccak256(abi.encode(newImplementation, data, finalize));
        uint256 activationTime = enabledTime()[implVectorHash];
        uint256 lastActivationTime = expirationTime()[implVectorHash];
        require(activationTime > 0, "UNKNOWN_UPGRADE_INFORMATION");
        require(newImplementation.isContract(), "ADDRESS_NOT_CONTRACT");

        // On the first time an implementation is set - time-lock should not be enforced.
        require(
            activationTime <= block.timestamp || implementation() == address(0x0),
            "UPGRADE_NOT_ENABLED_YET"
        );
        require(lastActivationTime >= block.timestamp, "IMPLEMENTATION_EXPIRED");

        setImplementation(newImplementation);

        // NOLINTNEXTLINE: low-level-calls controlled-delegatecall.
        (bool success, bytes memory returndata) = newImplementation.delegatecall(
            abi.encodeWithSelector(this.initialize.selector, data)
        );
        require(success, string(returndata));

        // Verify that the new implementation is not frozen post initialization.
        // NOLINTNEXTLINE: low-level-calls controlled-delegatecall.
        (success, returndata) = newImplementation.delegatecall(
            abi.encodeWithSignature("isFrozen()")
        );
        require(success, "CALL_TO_ISFROZEN_REVERTED");
        require(!abi.decode(returndata, (bool)), "NEW_IMPLEMENTATION_FROZEN");

        // Remove implementation activation entries.
        delete enabledTime()[implVectorHash];
        delete expirationTime()[implVectorHash];

        emit ImplementationUpgraded(newImplementation, data);

        if (finalize) {
            setFinalizedFlag();
            emit FinalizedImplementation(newImplementation);
        }
    }
}