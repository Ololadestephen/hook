// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title HookFlowDemoToken
/// @notice Mintable six-decimal ERC-20 used only for the public Sepolia demo market.
contract HookFlowDemoToken {
    string public name;
    string public symbol;
    uint8 public constant decimals = 6;
    uint256 public totalSupply;
    address public immutable owner;

    mapping(address account => uint256 balance) public balanceOf;
    mapping(address account => mapping(address spender => uint256 amount)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    error NotOwner();
    error InsufficientBalance();
    error InsufficientAllowance();
    error InvalidRecipient();

    constructor(string memory tokenName, string memory tokenSymbol, uint256 initialSupply) {
        name = tokenName;
        symbol = tokenSymbol;
        owner = msg.sender;
        _mint(msg.sender, initialSupply);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address recipient, uint256 amount) external returns (bool) {
        _transfer(msg.sender, recipient, amount);
        return true;
    }

    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool) {
        uint256 permitted = allowance[sender][msg.sender];
        if (permitted < amount) revert InsufficientAllowance();
        if (permitted != type(uint256).max) {
            allowance[sender][msg.sender] = permitted - amount;
            emit Approval(sender, msg.sender, permitted - amount);
        }
        _transfer(sender, recipient, amount);
        return true;
    }

    function mint(address recipient, uint256 amount) external {
        if (msg.sender != owner) revert NotOwner();
        _mint(recipient, amount);
    }

    function _transfer(address sender, address recipient, uint256 amount) private {
        if (recipient == address(0)) revert InvalidRecipient();
        uint256 senderBalance = balanceOf[sender];
        if (senderBalance < amount) revert InsufficientBalance();
        unchecked {
            balanceOf[sender] = senderBalance - amount;
        }
        balanceOf[recipient] += amount;
        emit Transfer(sender, recipient, amount);
    }

    function _mint(address recipient, uint256 amount) private {
        if (recipient == address(0)) revert InvalidRecipient();
        totalSupply += amount;
        balanceOf[recipient] += amount;
        emit Transfer(address(0), recipient, amount);
    }
}
