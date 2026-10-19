// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract PredictionMarket is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum Outcome {
        Unresolved,
        Yes,
        No
    }

    struct Market {
        address creator;
        uint40 deadline;
        uint40 resolutionDeadline;
        Outcome outcome;
        bool resolved;
        uint128 yesTotal;
        uint128 noTotal;
        uint128 feeAmount;
        uint128 distributablePot;
    }

    error ZeroAddress();
    error InvalidTokenAddress();
    error InvalidMarket();
    error InvalidQuestion();
    error InvalidDeadline();
    error InvalidResolutionWindow();
    error InvalidAmount();
    error BetTooSmall(uint256 minBetAmount);
    error MarketClosed();
    error MarketNotClosed();
    error MarketAlreadyResolved();
    error MarketNotResolved();
    error NotMarketCreator();
    error ResolutionWindowExpired();
    error FeeTooHigh();
    error AlreadyClaimed();
    error AlreadyRefunded();
    error NoWinningBet();
    error NoRefundableBet();
    error TokenTransferFailed();
    error WinningSideHasNoStake();

    event MarketCreated(
        uint256 indexed marketId,
        address indexed creator,
        string question,
        uint256 deadline,
        uint256 resolutionDeadline
    );
    event BetPlaced(uint256 indexed marketId, address indexed bettor, bool isYes, uint256 amount);
    event MarketResolved(
        uint256 indexed marketId,
        Outcome outcome,
        uint256 totalPot,
        uint256 feeAmount,
        uint256 distributablePot
    );
    event WinningsClaimed(uint256 indexed marketId, address indexed bettor, uint256 amount);
    event RefundClaimed(uint256 indexed marketId, address indexed bettor, uint256 amount);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event MinBetUpdated(uint256 oldMinBet, uint256 newMinBet);
    event ProtocolFeeUpdated(uint256 oldFeeBps, uint256 newFeeBps);

    uint16 public constant BPS_DENOMINATOR = 10_000;
    uint16 public constant MAX_PROTOCOL_FEE_BPS = 500; // 5%

    IERC20 public immutable usdc;
    address public treasury;
    uint256 public minBet;
    uint16 public protocolFeeBps;
    uint256 public marketCount;

    mapping(uint256 => Market) private _markets;
    mapping(uint256 => string) public marketQuestion;
    mapping(uint256 => mapping(address => uint128)) private _yesBets;
    mapping(uint256 => mapping(address => uint128)) private _noBets;
    mapping(uint256 => mapping(address => bool)) public winningsClaimed;
    mapping(uint256 => mapping(address => bool)) public refundsClaimed;

    constructor(address usdc_, address treasury_, uint256 minBet_) Ownable(msg.sender) {
        if (usdc_ == address(0) || treasury_ == address(0)) revert ZeroAddress();
        if (usdc_.code.length == 0) revert InvalidTokenAddress();
        if (minBet_ == 0) revert InvalidAmount();

        usdc = IERC20(usdc_);
        treasury = treasury_;
        minBet = minBet_;
        protocolFeeBps = 200; // 2%
    }

    function createMarket(
        string calldata question,
        uint256 deadline,
        uint256 resolutionWindow
    ) external whenNotPaused returns (uint256 marketId) {
        if (bytes(question).length == 0) revert InvalidQuestion();
        if (deadline <= block.timestamp || deadline > type(uint40).max) revert InvalidDeadline();
        if (resolutionWindow == 0) revert InvalidResolutionWindow();

        uint256 resolutionDeadline = deadline + resolutionWindow;
        if (resolutionDeadline <= deadline || resolutionDeadline > type(uint40).max) {
            revert InvalidResolutionWindow();
        }

        marketId = marketCount;
        marketCount = marketId + 1;

        Market storage market = _markets[marketId];
        market.creator = msg.sender;
        market.deadline = uint40(deadline);
        market.resolutionDeadline = uint40(resolutionDeadline);
        market.outcome = Outcome.Unresolved;

        marketQuestion[marketId] = question;

        emit MarketCreated(marketId, msg.sender, question, deadline, resolutionDeadline);
    }

    function placeBet(uint256 marketId, bool betYes, uint256 amount) external whenNotPaused nonReentrant {
        if (amount == 0) revert InvalidAmount();
        if (amount < minBet) revert BetTooSmall(minBet);

        Market storage market = _getMarket(marketId);
        if (block.timestamp >= market.deadline) revert MarketClosed();

        _safeTransferFrom(msg.sender, address(this), amount);

        if (betYes) {
            _yesBets[marketId][msg.sender] += uint128(amount);
            market.yesTotal += uint128(amount);
        } else {
            _noBets[marketId][msg.sender] += uint128(amount);
            market.noTotal += uint128(amount);
        }

        emit BetPlaced(marketId, msg.sender, betYes, amount);
    }

    function resolveMarket(uint256 marketId, bool yesWins) external whenNotPaused nonReentrant {
        Market storage market = _getMarket(marketId);
        if (msg.sender != market.creator) revert NotMarketCreator();
        if (market.resolved) revert MarketAlreadyResolved();
        if (block.timestamp < market.deadline) revert MarketNotClosed();
        if (block.timestamp > market.resolutionDeadline) revert ResolutionWindowExpired();
        if (yesWins) {
            if (market.yesTotal == 0) revert WinningSideHasNoStake();
        } else {
            if (market.noTotal == 0) revert WinningSideHasNoStake();
        }

        market.resolved = true;
        market.outcome = yesWins ? Outcome.Yes : Outcome.No;

        uint256 totalPot = uint256(market.yesTotal) + uint256(market.noTotal);
        uint256 feeAmount = (totalPot * protocolFeeBps) / BPS_DENOMINATOR;
        uint256 distributable = totalPot - feeAmount;

        market.feeAmount = uint128(feeAmount);
        market.distributablePot = uint128(distributable);

        if (feeAmount > 0) {
            _safeTransfer(treasury, feeAmount);
        }

        emit MarketResolved(marketId, market.outcome, totalPot, feeAmount, distributable);
    }

    function claimWinnings(uint256 marketId) external whenNotPaused nonReentrant returns (uint256 payout) {
        Market storage market = _getMarket(marketId);
        if (!market.resolved) revert MarketNotResolved();
        if (winningsClaimed[marketId][msg.sender]) revert AlreadyClaimed();

        uint256 userStake;
        uint256 winningTotal;

        if (market.outcome == Outcome.Yes) {
            userStake = _yesBets[marketId][msg.sender];
            winningTotal = market.yesTotal;
        } else {
            userStake = _noBets[marketId][msg.sender];
            winningTotal = market.noTotal;
        }

        if (userStake == 0) revert NoWinningBet();

        payout = (userStake * uint256(market.distributablePot)) / winningTotal;
        winningsClaimed[marketId][msg.sender] = true;

        _safeTransfer(msg.sender, payout);

        emit WinningsClaimed(marketId, msg.sender, payout);
    }

    function claimRefund(uint256 marketId) external whenNotPaused nonReentrant returns (uint256 refund) {
        Market storage market = _getMarket(marketId);
        if (market.resolved) revert MarketAlreadyResolved();
        if (block.timestamp <= market.resolutionDeadline) revert ResolutionWindowExpired();
        if (refundsClaimed[marketId][msg.sender]) revert AlreadyRefunded();

        uint256 yesStake = _yesBets[marketId][msg.sender];
        uint256 noStake = _noBets[marketId][msg.sender];
        refund = yesStake + noStake;

        if (refund == 0) revert NoRefundableBet();

        refundsClaimed[marketId][msg.sender] = true;
        _safeTransfer(msg.sender, refund);

        emit RefundClaimed(marketId, msg.sender, refund);
    }

    function updateTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert ZeroAddress();
        address oldTreasury = treasury;
        treasury = newTreasury;

        emit TreasuryUpdated(oldTreasury, newTreasury);
    }

    function updateMinBet(uint256 newMinBet) external onlyOwner {
        if (newMinBet == 0) revert InvalidAmount();
        uint256 oldMinBet = minBet;
        minBet = newMinBet;

        emit MinBetUpdated(oldMinBet, newMinBet);
    }

    function updateProtocolFee(uint16 newFeeBps) external onlyOwner {
        if (newFeeBps > MAX_PROTOCOL_FEE_BPS) revert FeeTooHigh();
        uint16 oldFeeBps = protocolFeeBps;
        protocolFeeBps = newFeeBps;

        emit ProtocolFeeUpdated(oldFeeBps, newFeeBps);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function getMarket(uint256 marketId) external view returns (Market memory) {
        return _getMarket(marketId);
    }

    function getUserBets(uint256 marketId, address user) external view returns (uint256 yesAmount, uint256 noAmount) {
        if (marketId >= marketCount) revert InvalidMarket();
        yesAmount = _yesBets[marketId][user];
        noAmount = _noBets[marketId][user];
    }

    function _getMarket(uint256 marketId) internal view returns (Market storage market) {
        if (marketId >= marketCount) revert InvalidMarket();
        market = _markets[marketId];
    }

    function _safeTransferFrom(address from, address to, uint256 value) internal {
        usdc.safeTransferFrom(from, to, value);
    }

    function _safeTransfer(address to, uint256 value) internal {
        usdc.safeTransfer(to, value);
    }
}
