library UnsafeBytes {
    function readUint32(bytes memory _bytes, uint256 _start) internal pure returns (uint32 result, uint256 offset) {
        assembly {
            offset := add(_start, 4)
            result := mload(add(_bytes, offset))
        }
    }

    function readAddress(bytes memory _bytes, uint256 _start) internal pure returns (address result, uint256 offset) {
        assembly {
            offset := add(_start, 20)
            result := mload(add(_bytes, offset))
        }
    }

    function readUint256(bytes memory _bytes, uint256 _start) internal pure returns (uint256 result, uint256 offset) {
        assembly {
            offset := add(_start, 32)
            result := mload(add(_bytes, offset))
        }
    }

    function readBytes32(bytes memory _bytes, uint256 _start) internal pure returns (bytes32 result, uint256 offset) {
        assembly {
            offset := add(_start, 32)
            result := mload(add(_bytes, offset))
        }
    }
}

library L2ContractHelper {
    /// @dev The prefix used to create CREATE2 addresses.
    bytes32 private constant CREATE2_PREFIX = keccak256("zksyncCreate2");

    /// @notice Validate the bytecode format and calculate its hash.
    /// @param _bytecode The bytecode to hash.
    /// @return hashedBytecode The 32-byte hash of the bytecode.
    /// Note: The function reverts the execution if the bytecode has non expected format:
    /// - Bytecode bytes length is not a multiple of 32
    /// - Bytecode bytes length is not less than 2^21 bytes (2^16 words)
    /// - Bytecode words length is not odd
    function hashL2Bytecode(bytes memory _bytecode) internal pure returns (bytes32 hashedBytecode) {
        // Note that the length of the bytecode must be provided in 32-byte words.
        require(_bytecode.length % 32 == 0, "pq");

        uint256 bytecodeLenInWords = _bytecode.length / 32;
        require(bytecodeLenInWords < 2 ** 16, "pp"); // bytecode length must be less than 2^16 words
        require(bytecodeLenInWords % 2 == 1, "ps"); // bytecode length in words must be odd
        hashedBytecode = sha256(_bytecode) & 0x00000000FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF;
        // Setting the version of the hash
        hashedBytecode = (hashedBytecode | bytes32(uint256(1 << 248)));
        // Setting the length
        hashedBytecode = hashedBytecode | bytes32(bytecodeLenInWords << 224);
    }

    /// @notice Validates the format of the given bytecode hash.
    /// @dev Due to the specification of the L2 bytecode hash, not every 32 bytes could be a legit bytecode hash.
    /// @dev The function reverts on invalid bytecode hash formam.
    /// @param _bytecodeHash The hash of the bytecode to validate.
    function validateBytecodeHash(bytes32 _bytecodeHash) internal pure {
        uint8 version = uint8(_bytecodeHash[0]);
        require(version == 1 && _bytecodeHash[1] == bytes1(0), "zf"); // Incorrectly formatted bytecodeHash

        require(_bytecodeLen(_bytecodeHash) % 2 == 1, "uy"); // Code length in words must be odd
    }

    /// @notice Returns the length of the bytecode associated with the given hash.
    /// @param _bytecodeHash The hash of the bytecode.
    /// @return codeLengthInWords The length of the bytecode in words.
    function _bytecodeLen(bytes32 _bytecodeHash) private pure returns (uint256 codeLengthInWords) {
        codeLengthInWords = uint256(uint8(_bytecodeHash[2])) * 256 + uint256(uint8(_bytecodeHash[3]));
    }

    /// @notice Computes the create2 address for a Layer 2 contract.
    /// @param _sender The address of the sender.
    /// @param _salt The salt value to use in the create2 address computation.
    /// @param _bytecodeHash The contract bytecode hash.
    /// @param _constructorInputHash The hash of the constructor input data.
    /// @return The create2 address of the contract.
    /// NOTE: L2 create2 derivation is different from L1 derivation!
    function computeCreate2Address(
        address _sender,
        bytes32 _salt,
        bytes32 _bytecodeHash,
        bytes32 _constructorInputHash
    ) internal pure returns (address) {
        bytes32 senderBytes = bytes32(uint256(uint160(_sender)));
        bytes32 data = keccak256(
            bytes.concat(CREATE2_PREFIX, senderBytes, _salt, _bytecodeHash, _constructorInputHash)
        );

        return address(uint160(uint256(data)));
    }
}

library TransactionValidator {
    /// @dev Used to validate key properties of an L1->L2 transaction
    /// @param _transaction The transaction to validate
    /// @param _encoded The abi encoded bytes of the transaction
    /// @param _priorityTxMaxGasLimit The max gas limit, generally provided from Storage.sol
    /// @param _priorityTxMaxPubdata The maximal amount of pubdata that a single L1->L2 transaction can emit
    function validateL1ToL2Transaction(
        IMailbox.L2CanonicalTransaction memory _transaction,
        bytes memory _encoded,
        uint256 _priorityTxMaxGasLimit,
        uint256 _priorityTxMaxPubdata
    ) internal pure {
        uint256 l2GasForTxBody = getTransactionBodyGasLimit(_transaction.gasLimit, _encoded.length);

        // Ensuring that the transaction is provable
        require(l2GasForTxBody <= _priorityTxMaxGasLimit, "ui");
        // Ensuring that the transaction cannot output more pubdata than is processable
        require(l2GasForTxBody / _transaction.gasPerPubdataByteLimit <= _priorityTxMaxPubdata, "uk");

        // Ensuring that the transaction covers the minimal costs for its processing:
        // hashing its content, publishing the factory dependencies, etc.
        require(
            getMinimalPriorityTransactionGasLimit(
                _encoded.length,
                _transaction.factoryDeps.length,
                _transaction.gasPerPubdataByteLimit
            ) <= l2GasForTxBody,
            "up"
        );
    }

    /// @dev Used to validate upgrade transactions
    /// @param _transaction The transaction to validate
    function validateUpgradeTransaction(IMailbox.L2CanonicalTransaction memory _transaction) internal pure {
        // Restrict from to be within system contract range (0...2^16 - 1)
        require(_transaction.from <= type(uint16).max, "ua");
        require(_transaction.to <= type(uint160).max, "ub");
        require(_transaction.paymaster == 0, "uc");
        require(_transaction.value == 0, "ud");
        require(_transaction.maxFeePerGas == 0, "uq");
        require(_transaction.maxPriorityFeePerGas == 0, "ux");
        require(_transaction.reserved[0] == 0, "ue");
        require(_transaction.reserved[1] <= type(uint160).max, "uf");
        require(_transaction.reserved[2] == 0, "ug");
        require(_transaction.reserved[3] == 0, "uo");
        require(_transaction.signature.length == 0, "uh");
        require(_transaction.paymasterInput.length == 0, "ul");
        require(_transaction.reservedDynamic.length == 0, "um");
    }

    /// @dev Calculates the approximate minimum gas limit required for executing a priority transaction.
    /// @param _encodingLength The length of the priority transaction encoding in bytes.
    /// @param _numberOfFactoryDependencies The number of new factory dependencies that will be added.
    /// @param _l2GasPricePerPubdata The L2 gas price for publishing the priority transaction on L2.
    /// @return The minimum gas limit required to execute the priority transaction.
    /// Note: The calculation includes the main cost of the priority transaction, however, in reality, the operator can spend a little more gas on overheads.
    function getMinimalPriorityTransactionGasLimit(
        uint256 _encodingLength,
        uint256 _numberOfFactoryDependencies,
        uint256 _l2GasPricePerPubdata
    ) internal pure returns (uint256) {
        uint256 costForComputation;
        {
            // Adding the intrinsic cost for the transaction, i.e. auxiliary prices which cannot be easily accounted for
            costForComputation = L1_TX_INTRINSIC_L2_GAS;

            // Taking into account the hashing costs that depend on the length of the transaction
            // Note that L1_TX_DELTA_544_ENCODING_BYTES is the delta in the price for every 544 bytes of
            // the transaction's encoding. It is taken as LCM between 136 and 32 (the length for each keccak256 round
            // and the size of each new encoding word).
            costForComputation += Math.ceilDiv(_encodingLength * L1_TX_DELTA_544_ENCODING_BYTES, 544);

            // Taking into the account the additional costs of providing new factory dependencies
            costForComputation += _numberOfFactoryDependencies * L1_TX_DELTA_FACTORY_DEPS_L2_GAS;

            // There is a minimal amount of computational L2 gas that the transaction should cover
            costForComputation = Math.max(costForComputation, L1_TX_MIN_L2_GAS_BASE);
        }

        uint256 costForPubdata = 0;
        {
            // Adding the intrinsic cost for the transaction, i.e. auxiliary prices which cannot be easily accounted for
            costForPubdata = L1_TX_INTRINSIC_PUBDATA * _l2GasPricePerPubdata;

            // Taking into the account the additional costs of providing new factory dependencies
            costForPubdata += _numberOfFactoryDependencies * L1_TX_DELTA_FACTORY_DEPS_PUBDATA * _l2GasPricePerPubdata;
        }

        return costForComputation + costForPubdata;
    }

    /// @notice Based on the full L2 gas limit (that includes the batch overhead) and other
    /// properties of the transaction, returns the l2GasLimit for the body of the transaction (the actual execution).
    /// @param _totalGasLimit The L2 gas limit that includes both the overhead for processing the batch
    /// and the L2 gas needed to process the transaction itself (i.e. the actual l2GasLimit that will be used for the transaction).
    /// @param _encodingLength The length of the ABI-encoding of the transaction.
    function getTransactionBodyGasLimit(
        uint256 _totalGasLimit,
        uint256 _encodingLength
    ) internal pure returns (uint256 txBodyGasLimit) {
        uint256 overhead = getOverheadForTransaction(_encodingLength);

        require(_totalGasLimit >= overhead, "my"); // provided gas limit doesn't cover transaction overhead
        unchecked {
            // We enforce the fact that `_totalGasLimit >= overhead` explicitly above.
            txBodyGasLimit = _totalGasLimit - overhead;
        }
    }

    /// @notice Based on the total L2 gas limit and several other parameters of the transaction
    /// returns the part of the L2 gas that will be spent on the batch's overhead.
    /// @dev The details of how this function works can be checked in the documentation
    /// of the fee model of zkSync. The appropriate comments are also present
    /// in the Rust implementation description of function `get_maximal_allowed_overhead`.
    /// @param _encodingLength The length of the binary encoding of the transaction in bytes
    function getOverheadForTransaction(
        uint256 _encodingLength
    ) internal pure returns (uint256 batchOverheadForTransaction) {
        // The overhead from taking up the transaction's slot
        batchOverheadForTransaction = TX_SLOT_OVERHEAD_L2_GAS;

        // The overhead for occupying the bootloader memory can be derived from encoded_len
        uint256 overheadForLength = MEMORY_OVERHEAD_GAS * _encodingLength;
        batchOverheadForTransaction = Math.max(batchOverheadForTransaction, overheadForLength);
    }
}

library AddressAliasHelper {
    uint160 constant offset = uint160(0x1111000000000000000000000000000000001111);

    /// @notice Utility function converts the address that submitted a tx
    /// to the inbox on L1 to the msg.sender viewed on L2
    /// @param l1Address the address in the L1 that triggered the tx to L2
    /// @return l2Address L2 address as viewed in msg.sender
    function applyL1ToL2Alias(address l1Address) internal pure returns (address l2Address) {
        unchecked {
            l2Address = address(uint160(l1Address) + offset);
        }
    }

    /// @notice Utility function that converts the msg.sender viewed on L2 to the
    /// address that submitted a tx to the inbox on L1
    /// @param l2Address L2 address as viewed in msg.sender
    /// @return l1Address the address in the L1 that triggered the tx to L2
    function undoL1ToL2Alias(address l2Address) internal pure returns (address l1Address) {
        unchecked {
            l1Address = address(uint160(l2Address) - offset);
        }
    }
}

library Math {
    enum Rounding {
        Down, // Toward negative infinity
        Up, // Toward infinity
        Zero // Toward zero
    }

    /**
     * @dev Returns the largest of two numbers.
     */
    function max(uint256 a, uint256 b) internal pure returns (uint256) {
        return a > b ? a : b;
    }

    /**
     * @dev Returns the smallest of two numbers.
     */
    function min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }

    /**
     * @dev Returns the average of two numbers. The result is rounded towards
     * zero.
     */
    function average(uint256 a, uint256 b) internal pure returns (uint256) {
        // (a + b) / 2 can overflow.
        return (a & b) + (a ^ b) / 2;
    }

    /**
     * @dev Returns the ceiling of the division of two numbers.
     *
     * This differs from standard division with `/` in that it rounds up instead
     * of rounding down.
     */
    function ceilDiv(uint256 a, uint256 b) internal pure returns (uint256) {
        // (a + b - 1) / b can overflow on addition, so we distribute.
        return a == 0 ? 0 : (a - 1) / b + 1;
    }

    /**
     * @notice Calculates floor(x * y / denominator) with full precision. Throws if result overflows a uint256 or denominator == 0
     * @dev Original credit to Remco Bloemen under MIT license (https://xn--2-umb.com/21/muldiv)
     * with further edits by Uniswap Labs also under MIT license.
     */
    function mulDiv(uint256 x, uint256 y, uint256 denominator) internal pure returns (uint256 result) {
        unchecked {
            // 512-bit multiply [prod1 prod0] = x * y. Compute the product mod 2^256 and mod 2^256 - 1, then use
            // use the Chinese Remainder Theorem to reconstruct the 512 bit result. The result is stored in two 256
            // variables such that product = prod1 * 2^256 + prod0.
            uint256 prod0; // Least significant 256 bits of the product
            uint256 prod1; // Most significant 256 bits of the product
            assembly {
                let mm := mulmod(x, y, not(0))
                prod0 := mul(x, y)
                prod1 := sub(sub(mm, prod0), lt(mm, prod0))
            }

            // Handle non-overflow cases, 256 by 256 division.
            if (prod1 == 0) {
                // Solidity will revert if denominator == 0, unlike the div opcode on its own.
                // The surrounding unchecked block does not change this fact.
                // See https://docs.soliditylang.org/en/latest/control-structures.html#checked-or-unchecked-arithmetic.
                return prod0 / denominator;
            }

            // Make sure the result is less than 2^256. Also prevents denominator == 0.
            require(denominator > prod1, "Math: mulDiv overflow");

            ///////////////////////////////////////////////
            // 512 by 256 division.
            ///////////////////////////////////////////////

            // Make division exact by subtracting the remainder from [prod1 prod0].
            uint256 remainder;
            assembly {
                // Compute remainder using mulmod.
                remainder := mulmod(x, y, denominator)

                // Subtract 256 bit number from 512 bit number.
                prod1 := sub(prod1, gt(remainder, prod0))
                prod0 := sub(prod0, remainder)
            }

            // Factor powers of two out of denominator and compute largest power of two divisor of denominator. Always >= 1.
            // See https://cs.stackexchange.com/q/138556/92363.

            // Does not overflow because the denominator cannot be zero at this stage in the function.
            uint256 twos = denominator & (~denominator + 1);
            assembly {
                // Divide denominator by twos.
                denominator := div(denominator, twos)

                // Divide [prod1 prod0] by twos.
                prod0 := div(prod0, twos)

                // Flip twos such that it is 2^256 / twos. If twos is zero, then it becomes one.
                twos := add(div(sub(0, twos), twos), 1)
            }

            // Shift in bits from prod1 into prod0.
            prod0 |= prod1 * twos;

            // Invert denominator mod 2^256. Now that denominator is an odd number, it has an inverse modulo 2^256 such
            // that denominator * inv = 1 mod 2^256. Compute the inverse by starting with a seed that is correct for
            // four bits. That is, denominator * inv = 1 mod 2^4.
            uint256 inverse = (3 * denominator) ^ 2;

            // Use the Newton-Raphson iteration to improve the precision. Thanks to Hensel's lifting lemma, this also works
            // in modular arithmetic, doubling the correct bits in each step.
            inverse *= 2 - denominator * inverse; // inverse mod 2^8
            inverse *= 2 - denominator * inverse; // inverse mod 2^16
            inverse *= 2 - denominator * inverse; // inverse mod 2^32
            inverse *= 2 - denominator * inverse; // inverse mod 2^64
            inverse *= 2 - denominator * inverse; // inverse mod 2^128
            inverse *= 2 - denominator * inverse; // inverse mod 2^256

            // Because the division is now exact we can divide by multiplying with the modular inverse of denominator.
            // This will give us the correct result modulo 2^256. Since the preconditions guarantee that the outcome is
            // less than 2^256, this is the final result. We don't need to compute the high bits of the result and prod1
            // is no longer required.
            result = prod0 * inverse;
            return result;
        }
    }

    /**
     * @notice Calculates x * y / denominator with full precision, following the selected rounding direction.
     */
    function mulDiv(uint256 x, uint256 y, uint256 denominator, Rounding rounding) internal pure returns (uint256) {
        uint256 result = mulDiv(x, y, denominator);
        if (rounding == Rounding.Up && mulmod(x, y, denominator) > 0) {
            result += 1;
        }
        return result;
    }

    /**
     * @dev Returns the square root of a number. If the number is not a perfect square, the value is rounded down.
     *
     * Inspired by Henry S. Warren, Jr.'s "Hacker's Delight" (Chapter 11).
     */
    function sqrt(uint256 a) internal pure returns (uint256) {
        if (a == 0) {
            return 0;
        }

        // For our first guess, we get the biggest power of 2 which is smaller than the square root of the target.
        //
        // We know that the "msb" (most significant bit) of our target number `a` is a power of 2 such that we have
        // `msb(a) <= a < 2*msb(a)`. This value can be written `msb(a)=2**k` with `k=log2(a)`.
        //
        // This can be rewritten `2**log2(a) <= a < 2**(log2(a) + 1)`
        // → `sqrt(2**k) <= sqrt(a) < sqrt(2**(k+1))`
        // → `2**(k/2) <= sqrt(a) < 2**((k+1)/2) <= 2**(k/2 + 1)`
        //
        // Consequently, `2**(log2(a) / 2)` is a good first approximation of `sqrt(a)` with at least 1 correct bit.
        uint256 result = 1 << (log2(a) >> 1);

        // At this point `result` is an estimation with one bit of precision. We know the true value is a uint128,
        // since it is the square root of a uint256. Newton's method converges quadratically (precision doubles at
        // every iteration). We thus need at most 7 iteration to turn our partial result with one bit of precision
        // into the expected uint128 result.
        unchecked {
            result = (result + a / result) >> 1;
            result = (result + a / result) >> 1;
            result = (result + a / result) >> 1;
            result = (result + a / result) >> 1;
            result = (result + a / result) >> 1;
            result = (result + a / result) >> 1;
            result = (result + a / result) >> 1;
            return min(result, a / result);
        }
    }

    /**
     * @notice Calculates sqrt(a), following the selected rounding direction.
     */
    function sqrt(uint256 a, Rounding rounding) internal pure returns (uint256) {
        unchecked {
            uint256 result = sqrt(a);
            return result + (rounding == Rounding.Up && result * result < a ? 1 : 0);
        }
    }

    /**
     * @dev Return the log in base 2, rounded down, of a positive value.
     * Returns 0 if given 0.
     */
    function log2(uint256 value) internal pure returns (uint256) {
        uint256 result = 0;
        unchecked {
            if (value >> 128 > 0) {
                value >>= 128;
                result += 128;
            }
            if (value >> 64 > 0) {
                value >>= 64;
                result += 64;
            }
            if (value >> 32 > 0) {
                value >>= 32;
                result += 32;
            }
            if (value >> 16 > 0) {
                value >>= 16;
                result += 16;
            }
            if (value >> 8 > 0) {
                value >>= 8;
                result += 8;
            }
            if (value >> 4 > 0) {
                value >>= 4;
                result += 4;
            }
            if (value >> 2 > 0) {
                value >>= 2;
                result += 2;
            }
            if (value >> 1 > 0) {
                result += 1;
            }
        }
        return result;
    }

    /**
     * @dev Return the log in base 2, following the selected rounding direction, of a positive value.
     * Returns 0 if given 0.
     */
    function log2(uint256 value, Rounding rounding) internal pure returns (uint256) {
        unchecked {
            uint256 result = log2(value);
            return result + (rounding == Rounding.Up && 1 << result < value ? 1 : 0);
        }
    }

    /**
     * @dev Return the log in base 10, rounded down, of a positive value.
     * Returns 0 if given 0.
     */
    function log10(uint256 value) internal pure returns (uint256) {
        uint256 result = 0;
        unchecked {
            if (value >= 10 ** 64) {
                value /= 10 ** 64;
                result += 64;
            }
            if (value >= 10 ** 32) {
                value /= 10 ** 32;
                result += 32;
            }
            if (value >= 10 ** 16) {
                value /= 10 ** 16;
                result += 16;
            }
            if (value >= 10 ** 8) {
                value /= 10 ** 8;
                result += 8;
            }
            if (value >= 10 ** 4) {
                value /= 10 ** 4;
                result += 4;
            }
            if (value >= 10 ** 2) {
                value /= 10 ** 2;
                result += 2;
            }
            if (value >= 10 ** 1) {
                result += 1;
            }
        }
        return result;
    }

    /**
     * @dev Return the log in base 10, following the selected rounding direction, of a positive value.
     * Returns 0 if given 0.
     */
    function log10(uint256 value, Rounding rounding) internal pure returns (uint256) {
        unchecked {
            uint256 result = log10(value);
            return result + (rounding == Rounding.Up && 10 ** result < value ? 1 : 0);
        }
    }

    /**
     * @dev Return the log in base 256, rounded down, of a positive value.
     * Returns 0 if given 0.
     *
     * Adding one to the result gives the number of pairs of hex symbols needed to represent `value` as a hex string.
     */
    function log256(uint256 value) internal pure returns (uint256) {
        uint256 result = 0;
        unchecked {
            if (value >> 128 > 0) {
                value >>= 128;
                result += 16;
            }
            if (value >> 64 > 0) {
                value >>= 64;
                result += 8;
            }
            if (value >> 32 > 0) {
                value >>= 32;
                result += 4;
            }
            if (value >> 16 > 0) {
                value >>= 16;
                result += 2;
            }
            if (value >> 8 > 0) {
                result += 1;
            }
        }
        return result;
    }

    /**
     * @dev Return the log in base 256, following the selected rounding direction, of a positive value.
     * Returns 0 if given 0.
     */
    function log256(uint256 value, Rounding rounding) internal pure returns (uint256) {
        unchecked {
            uint256 result = log256(value);
            return result + (rounding == Rounding.Up && 1 << (result << 3) < value ? 1 : 0);
        }
    }
}

library Merkle {
    using UncheckedMath for uint256;

    /// @dev Calculate Merkle root by the provided Merkle proof.
    /// NOTE: When using this function, check that the _path length is equal to the tree height to prevent shorter/longer paths attack
    /// @param _path Merkle path from the leaf to the root
    /// @param _index Leaf index in the tree
    /// @param _itemHash Hash of leaf content
    /// @return The Merkle root
    function calculateRoot(
        bytes32[] calldata _path,
        uint256 _index,
        bytes32 _itemHash
    ) internal pure returns (bytes32) {
        uint256 pathLength = _path.length;
        require(pathLength > 0, "xc");
        require(pathLength < 256, "bt");
        require(_index < (1 << pathLength), "px");

        bytes32 currentHash = _itemHash;
        for (uint256 i; i < pathLength; i = i.uncheckedInc()) {
            currentHash = (_index % 2 == 0)
                ? _efficientHash(currentHash, _path[i])
                : _efficientHash(_path[i], currentHash);
            _index /= 2;
        }

        return currentHash;
    }

    /// @dev Keccak hash of the concatenation of two 32-byte words
    function _efficientHash(bytes32 _lhs, bytes32 _rhs) private pure returns (bytes32 result) {
        assembly {
            mstore(0x00, _lhs)
            mstore(0x20, _rhs)
            result := keccak256(0x00, 0x40)
        }
    }
}

library PriorityQueue {
    using PriorityQueue for Queue;

    /// @notice Container that stores priority operations
    /// @param data The inner mapping that saves priority operation by its index
    /// @param head The pointer to the first unprocessed priority operation, equal to the tail if the queue is empty
    /// @param tail The pointer to the free slot
    struct Queue {
        mapping(uint256 priorityOpId => PriorityOperation priorityOp) data;
        uint256 tail;
        uint256 head;
    }

    /// @notice Returns zero if and only if no operations were processed from the queue
    /// @return Index of the oldest priority operation that wasn't processed yet
    function getFirstUnprocessedPriorityTx(Queue storage _queue) internal view returns (uint256) {
        return _queue.head;
    }

    /// @return The total number of priority operations that were added to the priority queue, including all processed ones
    function getTotalPriorityTxs(Queue storage _queue) internal view returns (uint256) {
        return _queue.tail;
    }

    /// @return The total number of unprocessed priority operations in a priority queue
    function getSize(Queue storage _queue) internal view returns (uint256) {
        return uint256(_queue.tail - _queue.head);
    }

    /// @return Whether the priority queue contains no operations
    function isEmpty(Queue storage _queue) internal view returns (bool) {
        return _queue.tail == _queue.head;
    }

    /// @notice Add the priority operation to the end of the priority queue
    function pushBack(Queue storage _queue, PriorityOperation memory _operation) internal {
        // Save value into the stack to avoid double reading from the storage
        uint256 tail = _queue.tail;

        _queue.data[tail] = _operation;
        _queue.tail = tail + 1;
    }

    /// @return The first unprocessed priority operation from the queue
    function front(Queue storage _queue) internal view returns (PriorityOperation memory) {
        require(!_queue.isEmpty(), "D"); // priority queue is empty

        return _queue.data[_queue.head];
    }

    /// @notice Remove the first unprocessed priority operation from the queue
    /// @return priorityOperation that was popped from the priority queue
    function popFront(Queue storage _queue) internal returns (PriorityOperation memory priorityOperation) {
        require(!_queue.isEmpty(), "s"); // priority queue is empty

        // Save value into the stack to avoid double reading from the storage
        uint256 head = _queue.head;

        priorityOperation = _queue.data[head];
        delete _queue.data[head];
        _queue.head = head + 1;
    }
}

library UncheckedMath {
    function uncheckedInc(uint256 _number) internal pure returns (uint256) {
        unchecked {
            return _number + 1;
        }
    }

    function uncheckedAdd(uint256 _lhs, uint256 _rhs) internal pure returns (uint256) {
        unchecked {
            return _lhs + _rhs;
        }
    }
}

interface IBase {
    /// @return Returns facet name.
    function getName() external view returns (string memory);
}

interface IMailbox is IBase {
    /// @dev Structure that includes all fields of the L2 transaction
    /// @dev The hash of this structure is the "canonical L2 transaction hash" and can be used as a unique identifier of a tx
    /// @param txType The tx type number, depending on which the L2 transaction can be interpreted differently
    /// @param from The sender's address. `uint256` type for possible address format changes and maintaining backward compatibility
    /// @param to The recipient's address. `uint256` type for possible address format changes and maintaining backward compatibility
    /// @param gasLimit The L2 gas limit for L2 transaction. Analog to the `gasLimit` on an L1 transactions
    /// @param gasPerPubdataByteLimit Maximum number of L2 gas that will cost one byte of pubdata (every piece of data that will be stored on L1 as calldata)
    /// @param maxFeePerGas The absolute maximum sender willing to pay per unit of L2 gas to get the transaction included in a batch. Analog to the EIP-1559 `maxFeePerGas` on an L1 transactions
    /// @param maxPriorityFeePerGas The additional fee that is paid directly to the validator to incentivize them to include the transaction in a batch. Analog to the EIP-1559 `maxPriorityFeePerGas` on an L1 transactions
    /// @param paymaster The address of the EIP-4337 paymaster, that will pay fees for the transaction. `uint256` type for possible address format changes and maintaining backward compatibility
    /// @param nonce The nonce of the transaction. For L1->L2 transactions it is the priority operation Id.
    /// @param value The value to pass with the transaction
    /// @param reserved The fixed-length fields for usage in a future extension of transaction formats
    /// @param data The calldata that is transmitted for the transaction call
    /// @param signature An abstract set of bytes that are used for transaction authorization
    /// @param factoryDeps The set of L2 bytecode hashes whose preimages were shown on L1
    /// @param paymasterInput The arbitrary-length data that is used as a calldata to the paymaster pre-call
    /// @param reservedDynamic The arbitrary-length field for usage in a future extension of transaction formats
    struct L2CanonicalTransaction {
        uint256 txType;
        uint256 from;
        uint256 to;
        uint256 gasLimit;
        uint256 gasPerPubdataByteLimit;
        uint256 maxFeePerGas;
        uint256 maxPriorityFeePerGas;
        uint256 paymaster;
        uint256 nonce;
        uint256 value;
        // In the future, we might want to add some
        // new fields to the struct. The `txData` struct
        // is to be passed to account and any changes to its structure
        // would mean a breaking change to these accounts. To prevent this,
        // we should keep some fields as "reserved".
        // It is also recommended that their length is fixed, since
        // it would allow easier proof integration (in case we will need
        // some special circuit for preprocessing transactions).
        uint256[4] reserved;
        bytes data;
        bytes signature;
        uint256[] factoryDeps;
        bytes paymasterInput;
        // Reserved dynamic type for the future use-case. Using it should be avoided,
        // But it is still here, just in case we want to enable some additional functionality.
        bytes reservedDynamic;
    }

    /// @dev Internal structure that contains the parameters for the writePriorityOp
    /// internal function.
    /// @param sender The sender's address.
    /// @param txId The id of the priority transaction.
    /// @param l2Value The msg.value of the L2 transaction.
    /// @param contractAddressL2 The address of the contract on L2 to call.
    /// @param expirationTimestamp The timestamp by which the priority operation must be processed by the operator.
    /// @param l2GasLimit The limit of the L2 gas for the L2 transaction
    /// @param l2GasPrice The price of the L2 gas in Wei to be used for this transaction.
    /// @param l2GasPricePerPubdata The price for a single pubdata byte in L2 gas.
    /// @param valueToMint The amount of ether that should be minted on L2 as the result of this transaction.
    /// @param refundRecipient The recipient of the refund for the transaction on L2. If the transaction fails, then
    /// this address will receive the `l2Value`.
    struct WritePriorityOpParams {
        address sender;
        uint256 txId;
        uint256 l2Value;
        address contractAddressL2;
        uint64 expirationTimestamp;
        uint256 l2GasLimit;
        uint256 l2GasPrice;
        uint256 l2GasPricePerPubdata;
        uint256 valueToMint;
        address refundRecipient;
    }

    /// @notice Prove that a specific arbitrary-length message was sent in a specific L2 batch number
    /// @param _l2BatchNumber The executed L2 batch number in which the message appeared
    /// @param _index The position in the L2 logs Merkle tree of the l2Log that was sent with the message
    /// @param _message Information about the sent message: sender address, the message itself, tx index in the L2 batch where the message was sent
    /// @param _proof Merkle proof for inclusion of L2 log that was sent with the message
    /// @return Whether the proof is valid
    function proveL2MessageInclusion(
        uint256 _l2BatchNumber,
        uint256 _index,
        L2Message calldata _message,
        bytes32[] calldata _proof
    ) external view returns (bool);

    /// @notice Prove that a specific L2 log was sent in a specific L2 batch
    /// @param _l2BatchNumber The executed L2 batch number in which the log appeared
    /// @param _index The position of the l2log in the L2 logs Merkle tree
    /// @param _log Information about the sent log
    /// @param _proof Merkle proof for inclusion of the L2 log
    /// @return Whether the proof is correct and L2 log is included in batch
    function proveL2LogInclusion(
        uint256 _l2BatchNumber,
        uint256 _index,
        L2Log memory _log,
        bytes32[] calldata _proof
    ) external view returns (bool);

    /// @notice Prove that the L1 -> L2 transaction was processed with the specified status.
    /// @param _l2TxHash The L2 canonical transaction hash
    /// @param _l2BatchNumber The L2 batch number where the transaction was processed
    /// @param _l2MessageIndex The position in the L2 logs Merkle tree of the l2Log that was sent with the message
    /// @param _l2TxNumberInBatch The L2 transaction number in the batch, in which the log was sent
    /// @param _merkleProof The Merkle proof of the processing L1 -> L2 transaction
    /// @param _status The execution status of the L1 -> L2 transaction (true - success & 0 - fail)
    /// @return Whether the proof is correct and the transaction was actually executed with provided status
    /// NOTE: It may return `false` for incorrect proof, but it doesn't mean that the L1 -> L2 transaction has an opposite status!
    function proveL1ToL2TransactionStatus(
        bytes32 _l2TxHash,
        uint256 _l2BatchNumber,
        uint256 _l2MessageIndex,
        uint16 _l2TxNumberInBatch,
        bytes32[] calldata _merkleProof,
        TxStatus _status
    ) external view returns (bool);

    /// @notice Finalize the withdrawal and release funds
    /// @param _l2BatchNumber The L2 batch number where the withdrawal was processed
    /// @param _l2MessageIndex The position in the L2 logs Merkle tree of the l2Log that was sent with the message
    /// @param _l2TxNumberInBatch The L2 transaction number in a batch, in which the log was sent
    /// @param _message The L2 withdraw data, stored in an L2 -> L1 message
    /// @param _merkleProof The Merkle proof of the inclusion L2 -> L1 message about withdrawal initialization
    function finalizeEthWithdrawal(
        uint256 _l2BatchNumber,
        uint256 _l2MessageIndex,
        uint16 _l2TxNumberInBatch,
        bytes calldata _message,
        bytes32[] calldata _merkleProof
    ) external;

    /// @notice Request execution of L2 transaction from L1.
    /// @param _contractL2 The L2 receiver address
    /// @param _l2Value `msg.value` of L2 transaction
    /// @param _calldata The input of the L2 transaction
    /// @param _l2GasLimit Maximum amount of L2 gas that transaction can consume during execution on L2
    /// @param _l2GasPerPubdataByteLimit The maximum amount L2 gas that the operator may charge the user for single byte of pubdata.
    /// @param _factoryDeps An array of L2 bytecodes that will be marked as known on L2
    /// @param _refundRecipient The address on L2 that will receive the refund for the transaction.
    /// @dev If the L2 deposit finalization transaction fails, the `_refundRecipient` will receive the `_l2Value`.
    /// Please note, the contract may change the refund recipient's address to eliminate sending funds to addresses out of control.
    /// - If `_refundRecipient` is a contract on L1, the refund will be sent to the aliased `_refundRecipient`.
    /// - If `_refundRecipient` is set to `address(0)` and the sender has NO deployed bytecode on L1, the refund will be sent to the `msg.sender` address.
    /// - If `_refundRecipient` is set to `address(0)` and the sender has deployed bytecode on L1, the refund will be sent to the aliased `msg.sender` address.
    /// @dev The address aliasing of L1 contracts as refund recipient on L2 is necessary to guarantee that the funds are controllable,
    /// since address aliasing to the from address for the L2 tx will be applied if the L1 `msg.sender` is a contract.
    /// Without address aliasing for L1 contracts as refund recipients they would not be able to make proper L2 tx requests
    /// through the Mailbox to use or withdraw the funds from L2, and the funds would be lost.
    /// @return canonicalTxHash The hash of the requested L2 transaction. This hash can be used to follow the transaction status
    function requestL2Transaction(
        address _contractL2,
        uint256 _l2Value,
        bytes calldata _calldata,
        uint256 _l2GasLimit,
        uint256 _l2GasPerPubdataByteLimit,
        bytes[] calldata _factoryDeps,
        address _refundRecipient
    ) external payable returns (bytes32 canonicalTxHash);

    /// @notice Estimates the cost in Ether of requesting execution of an L2 transaction from L1
    /// @param _gasPrice expected L1 gas price at which the user requests the transaction execution
    /// @param _l2GasLimit Maximum amount of L2 gas that transaction can consume during execution on L2
    /// @param _l2GasPerPubdataByteLimit The maximum amount of L2 gas that the operator may charge the user for a single byte of pubdata.
    /// @return The estimated ETH spent on L2 gas for the transaction
    function l2TransactionBaseCost(
        uint256 _gasPrice,
        uint256 _l2GasLimit,
        uint256 _l2GasPerPubdataByteLimit
    ) external view returns (uint256);

    /// @notice New priority request event. Emitted when a request is placed into the priority queue
    /// @param txId Serial number of the priority operation
    /// @param txHash keccak256 hash of encoded transaction representation
    /// @param expirationTimestamp Timestamp up to which priority request should be processed
    /// @param transaction The whole transaction structure that is requested to be executed on L2
    /// @param factoryDeps An array of bytecodes that were shown in the L1 public data. Will be marked as known bytecodes in L2
    event NewPriorityRequest(
        uint256 txId,
        bytes32 txHash,
        uint64 expirationTimestamp,
        L2CanonicalTransaction transaction,
        bytes[] factoryDeps
    );

    /// @notice Emitted when the withdrawal is finalized on L1 and funds are released.
    /// @param to The address to which the funds were sent
    /// @param amount The amount of funds that were sent
    event EthWithdrawalFinalized(address indexed to, uint256 amount);
}

abstract contract ReentrancyGuard {
    /// @dev Address of lock flag variable.
    /// @dev Flag is placed at random memory location to not interfere with Storage contract.
    // keccak256("ReentrancyGuard") - 1;
    uint256 private constant LOCK_FLAG_ADDRESS = 0x8e94fed44239eb2314ab7a406345e6c5a8f0ccedf3b600de3d004e672c33abf4;

    // solhint-disable-next-line max-line-length
    // https://github.com/OpenZeppelin/openzeppelin-contracts/blob/566a774222707e424896c0c390a84dc3c13bdcb2/contracts/security/ReentrancyGuard.sol
    // The values being non-zero value makes deployment a bit more expensive,
    // but in exchange the refund on every call to nonReentrant will be lower in
    // amount. Since refunds are capped to a percentage of the total
    // transaction's gas, it is best to keep them low in cases like this one, to
    // increase the likelihood of the full refund coming into effect.
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;

    modifier reentrancyGuardInitializer() {
        _initializeReentrancyGuard();
        _;
    }

    function _initializeReentrancyGuard() private {
        uint256 lockSlotOldValue;

        // Storing an initial non-zero value makes deployment a bit more
        // expensive but in exchange every call to nonReentrant
        // will be cheaper.
        assembly {
            lockSlotOldValue := sload(LOCK_FLAG_ADDRESS)
            sstore(LOCK_FLAG_ADDRESS, _NOT_ENTERED)
        }

        // Check that storage slot for reentrancy guard is empty to rule out possibility of slot conflict
        require(lockSlotOldValue == 0, "1B");
    }

    /**
     * @dev Prevents a contract from calling itself, directly or indirectly.
     * Calling a `nonReentrant` function from another `nonReentrant`
     * function is not supported. It is possible to prevent this from happening
     * by making the `nonReentrant` function external, and make it call a
     * `private` function that does the actual work.
     */
    modifier nonReentrant() {
        uint256 _status;
        assembly {
            _status := sload(LOCK_FLAG_ADDRESS)
        }

        // On the first call to nonReentrant, _notEntered will be true
        require(_status == _NOT_ENTERED, "r1");

        // Any calls to nonReentrant after this point will fail
        assembly {
            sstore(LOCK_FLAG_ADDRESS, _ENTERED)
        }

        _;

        // By storing the original value once again, a refund is triggered (see
        // https://eips.ethereum.org/EIPS/eip-2200)
        assembly {
            sstore(LOCK_FLAG_ADDRESS, _NOT_ENTERED)
        }
    }
}

contract Base is ReentrancyGuard {
    AppStorage internal s;

    /// @notice Checks that the message sender is an active governor
    modifier onlyGovernor() {
        require(msg.sender == s.governor, "1g"); // only by governor
        _;
    }

    /// @notice Checks that the message sender is an active governor or admin
    modifier onlyGovernorOrAdmin() {
        require(msg.sender == s.governor || msg.sender == s.admin, "1k");
        _;
    }

    /// @notice Checks if validator is active
    modifier onlyValidator() {
        require(s.validators[msg.sender], "1h"); // validator is not active
        _;
    }
}

contract MailboxFacet is Base, IMailbox {
    using UncheckedMath for uint256;
    using PriorityQueue for PriorityQueue.Queue;

    /// @inheritdoc IBase
    string public constant override getName = "MailboxFacet";

    /// @inheritdoc IMailbox
    function proveL2MessageInclusion(
        uint256 _batchNumber,
        uint256 _index,
        L2Message memory _message,
        bytes32[] calldata _proof
    ) public view returns (bool) {
        return _proveL2LogInclusion(_batchNumber, _index, _L2MessageToLog(_message), _proof);
    }

    /// @inheritdoc IMailbox
    function proveL2LogInclusion(
        uint256 _batchNumber,
        uint256 _index,
        L2Log memory _log,
        bytes32[] calldata _proof
    ) external view returns (bool) {
        return _proveL2LogInclusion(_batchNumber, _index, _log, _proof);
    }

    /// @inheritdoc IMailbox
    function proveL1ToL2TransactionStatus(
        bytes32 _l2TxHash,
        uint256 _l2BatchNumber,
        uint256 _l2MessageIndex,
        uint16 _l2TxNumberInBatch,
        bytes32[] calldata _merkleProof,
        TxStatus _status
    ) public view returns (bool) {
        // Bootloader sends an L2 -> L1 log only after processing the L1 -> L2 transaction.
        // Thus, we can verify that the L1 -> L2 transaction was included in the L2 batch with specified status.
        //
        // The semantics of such L2 -> L1 log is always:
        // - sender = L2_BOOTLOADER_ADDRESS
        // - key = hash(L1ToL2Transaction)
        // - value = status of the processing transaction (1 - success & 0 - fail)
        // - isService = true (just a conventional value)
        // - l2ShardId = 0 (means that L1 -> L2 transaction was processed in a rollup shard, other shards are not available yet anyway)
        // - txNumberInBatch = number of transaction in the batch
        L2Log memory l2Log = L2Log({
            l2ShardId: 0,
            isService: true,
            txNumberInBatch: _l2TxNumberInBatch,
            sender: L2_BOOTLOADER_ADDRESS,
            key: _l2TxHash,
            value: bytes32(uint256(_status))
        });
        return _proveL2LogInclusion(_l2BatchNumber, _l2MessageIndex, l2Log, _merkleProof);
    }

    /// @notice Transfer ether from the contract to the receiver
    /// @dev Reverts only if the transfer call failed
    function _withdrawFunds(address _to, uint256 _amount) internal {
        bool callSuccess;
        // Low-level assembly call, to avoid any memory copying (save gas)
        assembly {
            callSuccess := call(gas(), _to, _amount, 0, 0, 0, 0)
        }
        require(callSuccess, "pz");
    }

    /// @dev Prove that a specific L2 log was sent in a specific L2 batch number
    function _proveL2LogInclusion(
        uint256 _batchNumber,
        uint256 _index,
        L2Log memory _log,
        bytes32[] calldata _proof
    ) internal view returns (bool) {
        require(_batchNumber <= s.totalBatchesExecuted, "xx");

        bytes32 hashedLog = keccak256(
            abi.encodePacked(_log.l2ShardId, _log.isService, _log.txNumberInBatch, _log.sender, _log.key, _log.value)
        );
        // Check that hashed log is not the default one,
        // otherwise it means that the value is out of range of sent L2 -> L1 logs
        require(hashedLog != L2_L1_LOGS_TREE_DEFAULT_LEAF_HASH, "tw");

        // It is ok to not check length of `_proof` array, as length
        // of leaf preimage (which is `L2_TO_L1_LOG_SERIALIZE_SIZE`) is not
        // equal to the length of other nodes preimages (which are `2 * 32`)

        bytes32 calculatedRootHash = Merkle.calculateRoot(_proof, _index, hashedLog);
        bytes32 actualRootHash = s.l2LogsRootHashes[_batchNumber];

        return actualRootHash == calculatedRootHash;
    }

    /// @dev Convert arbitrary-length message to the raw l2 log
    function _L2MessageToLog(L2Message memory _message) internal pure returns (L2Log memory) {
        return
            L2Log({
                l2ShardId: 0,
                isService: true,
                txNumberInBatch: _message.txNumberInBatch,
                sender: L2_TO_L1_MESSENGER_SYSTEM_CONTRACT_ADDR,
                key: bytes32(uint256(uint160(_message.sender))),
                value: keccak256(_message.data)
            });
    }

    /// @inheritdoc IMailbox
    function l2TransactionBaseCost(
        uint256 _gasPrice,
        uint256 _l2GasLimit,
        uint256 _l2GasPerPubdataByteLimit
    ) public view returns (uint256) {
        uint256 l2GasPrice = _deriveL2GasPrice(_gasPrice, _l2GasPerPubdataByteLimit);
        return l2GasPrice * _l2GasLimit;
    }

    /// @notice Derives the price for L2 gas in ETH to be paid.
    /// @param _l1GasPrice The gas price on L1.
    /// @param _gasPerPubdata The price for each pubdata byte in L2 gas
    /// @return The price of L2 gas in ETH
    function _deriveL2GasPrice(uint256 _l1GasPrice, uint256 _gasPerPubdata) internal view returns (uint256) {
        FeeParams memory feeParams = s.feeParams;

        uint256 pubdataPriceETH;
        if (feeParams.pubdataPricingMode == PubdataPricingMode.Rollup) {
            pubdataPriceETH = L1_GAS_PER_PUBDATA_BYTE * _l1GasPrice;
        }

        uint256 batchOverheadETH = uint256(feeParams.batchOverheadL1Gas) * _l1GasPrice;
        uint256 fullPubdataPriceETH = pubdataPriceETH + batchOverheadETH / uint256(feeParams.maxPubdataPerBatch);

        uint256 l2GasPrice = feeParams.minimalL2GasPrice + batchOverheadETH / uint256(feeParams.maxL2GasPerBatch);
        uint256 minL2GasPriceETH = (fullPubdataPriceETH + _gasPerPubdata - 1) / _gasPerPubdata;

        return Math.max(l2GasPrice, minL2GasPriceETH);
    }

    /// @inheritdoc IMailbox
    function finalizeEthWithdrawal(
        uint256 _l2BatchNumber,
        uint256 _l2MessageIndex,
        uint16 _l2TxNumberInBatch,
        bytes calldata _message,
        bytes32[] calldata _merkleProof
    ) external nonReentrant {
        require(!s.isEthWithdrawalFinalized[_l2BatchNumber][_l2MessageIndex], "jj");

        L2Message memory l2ToL1Message = L2Message({
            txNumberInBatch: _l2TxNumberInBatch,
            sender: L2_ETH_TOKEN_SYSTEM_CONTRACT_ADDR,
            data: _message
        });

        (address _l1WithdrawReceiver, uint256 _amount) = _parseL2WithdrawalMessage(_message);

        bool proofValid = proveL2MessageInclusion(_l2BatchNumber, _l2MessageIndex, l2ToL1Message, _merkleProof);
        require(proofValid, "pi"); // Failed to verify that withdrawal was actually initialized on L2

        s.isEthWithdrawalFinalized[_l2BatchNumber][_l2MessageIndex] = true;
        _withdrawFunds(_l1WithdrawReceiver, _amount);

        emit EthWithdrawalFinalized(_l1WithdrawReceiver, _amount);
    }

    /// @inheritdoc IMailbox
    function requestL2Transaction(
        address _contractL2,
        uint256 _l2Value,
        bytes calldata _calldata,
        uint256 _l2GasLimit,
        uint256 _l2GasPerPubdataByteLimit,
        bytes[] calldata _factoryDeps,
        address _refundRecipient
    ) external payable nonReentrant returns (bytes32 canonicalTxHash) {
        // Change the sender address if it is a smart contract to prevent address collision between L1 and L2.
        // Please note, currently zkSync address derivation is different from Ethereum one, but it may be changed in the future.
        address sender = msg.sender;
        if (sender != tx.origin) {
            sender = AddressAliasHelper.applyL1ToL2Alias(msg.sender);
        }

        // Enforcing that `_l2GasPerPubdataByteLimit` equals to a certain constant number. This is needed
        // to ensure that users do not get used to using "exotic" numbers for _l2GasPerPubdataByteLimit, e.g. 1-2, etc.
        // VERY IMPORTANT: nobody should rely on this constant to be fixed and every contract should give their users the ability to provide the
        // ability to provide `_l2GasPerPubdataByteLimit` for each independent transaction.
        // CHANGING THIS CONSTANT SHOULD BE A CLIENT-SIDE CHANGE.
        require(_l2GasPerPubdataByteLimit == REQUIRED_L2_GAS_PRICE_PER_PUBDATA, "qp");

        canonicalTxHash = _requestL2Transaction(
            sender,
            _contractL2,
            _l2Value,
            _calldata,
            _l2GasLimit,
            _l2GasPerPubdataByteLimit,
            _factoryDeps,
            false,
            _refundRecipient
        );
    }

    function _requestL2Transaction(
        address _sender,
        address _contractAddressL2,
        uint256 _l2Value,
        bytes calldata _calldata,
        uint256 _l2GasLimit,
        uint256 _l2GasPerPubdataByteLimit,
        bytes[] calldata _factoryDeps,
        bool _isFree,
        address _refundRecipient
    ) internal returns (bytes32 canonicalTxHash) {
        require(_factoryDeps.length <= MAX_NEW_FACTORY_DEPS, "uj");
        uint64 expirationTimestamp = uint64(block.timestamp + PRIORITY_EXPIRATION); // Safe to cast
        uint256 txId = s.priorityQueue.getTotalPriorityTxs();

        // Here we manually assign fields for the struct to prevent "stack too deep" error
        WritePriorityOpParams memory params;

        // Checking that the user provided enough ether to pay for the transaction.
        // Using a new scope to prevent "stack too deep" error
        {
            params.l2GasPrice = _isFree ? 0 : _deriveL2GasPrice(tx.gasprice, _l2GasPerPubdataByteLimit);
            uint256 baseCost = params.l2GasPrice * _l2GasLimit;
            require(msg.value >= baseCost + _l2Value, "mv"); // The `msg.value` doesn't cover the transaction cost
        }

        // If the `_refundRecipient` is not provided, we use the `_sender` as the recipient.
        address refundRecipient = _refundRecipient == address(0) ? _sender : _refundRecipient;
        // If the `_refundRecipient` is a smart contract, we apply the L1 to L2 alias to prevent foot guns.
        if (refundRecipient.code.length > 0) {
            refundRecipient = AddressAliasHelper.applyL1ToL2Alias(refundRecipient);
        }

        params.sender = _sender;
        params.txId = txId;
        params.l2Value = _l2Value;
        params.contractAddressL2 = _contractAddressL2;
        params.expirationTimestamp = expirationTimestamp;
        params.l2GasLimit = _l2GasLimit;
        params.l2GasPricePerPubdata = _l2GasPerPubdataByteLimit;
        params.valueToMint = msg.value;
        params.refundRecipient = refundRecipient;

        canonicalTxHash = _writePriorityOp(params, _calldata, _factoryDeps);
    }

    function _serializeL2Transaction(
        WritePriorityOpParams memory _priorityOpParams,
        bytes calldata _calldata,
        bytes[] calldata _factoryDeps
    ) internal pure returns (L2CanonicalTransaction memory transaction) {
        transaction = L2CanonicalTransaction({
            txType: PRIORITY_OPERATION_L2_TX_TYPE,
            from: uint256(uint160(_priorityOpParams.sender)),
            to: uint256(uint160(_priorityOpParams.contractAddressL2)),
            gasLimit: _priorityOpParams.l2GasLimit,
            gasPerPubdataByteLimit: _priorityOpParams.l2GasPricePerPubdata,
            maxFeePerGas: uint256(_priorityOpParams.l2GasPrice),
            maxPriorityFeePerGas: uint256(0),
            paymaster: uint256(0),
            // Note, that the priority operation id is used as "nonce" for L1->L2 transactions
            nonce: uint256(_priorityOpParams.txId),
            value: _priorityOpParams.l2Value,
            reserved: [_priorityOpParams.valueToMint, uint256(uint160(_priorityOpParams.refundRecipient)), 0, 0],
            data: _calldata,
            signature: new bytes(0),
            factoryDeps: _hashFactoryDeps(_factoryDeps),
            paymasterInput: new bytes(0),
            reservedDynamic: new bytes(0)
        });
    }

    /// @notice Stores a transaction record in storage & send event about that
    function _writePriorityOp(
        WritePriorityOpParams memory _priorityOpParams,
        bytes calldata _calldata,
        bytes[] calldata _factoryDeps
    ) internal returns (bytes32 canonicalTxHash) {
        L2CanonicalTransaction memory transaction = _serializeL2Transaction(_priorityOpParams, _calldata, _factoryDeps);

        bytes memory transactionEncoding = abi.encode(transaction);

        TransactionValidator.validateL1ToL2Transaction(
            transaction,
            transactionEncoding,
            s.priorityTxMaxGasLimit,
            s.feeParams.priorityTxMaxPubdata
        );

        canonicalTxHash = keccak256(transactionEncoding);

        s.priorityQueue.pushBack(
            PriorityOperation({
                canonicalTxHash: canonicalTxHash,
                expirationTimestamp: _priorityOpParams.expirationTimestamp,
                layer2Tip: uint192(0) // TODO: Restore after fee modeling will be stable. (SMA-1230)
            })
        );

        // Data that is needed for the operator to simulate priority queue offchain
        emit NewPriorityRequest(
            _priorityOpParams.txId,
            canonicalTxHash,
            _priorityOpParams.expirationTimestamp,
            transaction,
            _factoryDeps
        );
    }

    /// @notice Hashes the L2 bytecodes and returns them in the format in which they are processed by the bootloader
    function _hashFactoryDeps(
        bytes[] calldata _factoryDeps
    ) internal pure returns (uint256[] memory hashedFactoryDeps) {
        uint256 factoryDepsLen = _factoryDeps.length;
        hashedFactoryDeps = new uint256[](factoryDepsLen);
        for (uint256 i = 0; i < factoryDepsLen; i = i.uncheckedInc()) {
            bytes32 hashedBytecode = L2ContractHelper.hashL2Bytecode(_factoryDeps[i]);

            // Store the resulting hash sequentially in bytes.
            assembly {
                mstore(add(hashedFactoryDeps, mul(add(i, 1), 32)), hashedBytecode)
            }
        }
    }

    /// @dev Decode the withdraw message that came from L2
    function _parseL2WithdrawalMessage(
        bytes memory _message
    ) internal pure returns (address l1Receiver, uint256 amount) {
        // We check that the message is long enough to read the data.
        // Please note that there are two versions of the message:
        // 1. The message that is sent by `withdraw(address _l1Receiver)`
        // It should be equal to the length of the bytes4 function signature + address l1Receiver + uint256 amount = 4 + 20 + 32 = 56 (bytes).
        // 2. The message that is sent by `withdrawWithMessage(address _l1Receiver, bytes calldata _additionalData)`
        // It should be equal to the length of the following:
        // bytes4 function signature + address l1Receiver + uint256 amount + address l2Sender + bytes _additionalData =
        // = 4 + 20 + 32 + 32 + _additionalData.length >= 68 (bytes).

        // So the data is expected to be at least 56 bytes long.
        require(_message.length >= 56, "pm");

        (uint32 functionSignature, uint256 offset) = UnsafeBytes.readUint32(_message, 0);
        require(bytes4(functionSignature) == this.finalizeEthWithdrawal.selector, "is");

        (l1Receiver, offset) = UnsafeBytes.readAddress(_message, offset);
        (amount, offset) = UnsafeBytes.readUint256(_message, offset);
    }
}