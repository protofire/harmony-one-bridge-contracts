pragma solidity 0.4.24;

import "../../upgradeability/EternalStorage.sol";
import "../../libraries/SafeMath.sol";
import "../Validatable.sol";
import "../BasicBridge.sol";


contract BasicAMB is BasicBridge {

    bytes constant internal SUBSIDIZED_MODE = bytes(abi.encodePacked("AMB-subsidized-mode"));
    bytes constant internal DEFRAYAL_MODE = bytes(abi.encodePacked("AMB-defrayal-mode"));

    function initialize(
        address _validatorContract,
        uint256 _maxPerTx,
        uint256 _gasPrice,
        uint256 _requiredBlockConfirmations
    ) public returns(bool) {
        require(!isInitialized());
        require(_validatorContract != address(0));
        require(_gasPrice > 0);
        require(_requiredBlockConfirmations > 0);
        require(_maxPerTx > 0);
        addressStorage[keccak256(abi.encodePacked("validatorContract"))] = _validatorContract;
        uintStorage[keccak256(abi.encodePacked("deployedAtBlock"))] = block.number;
        uintStorage[keccak256(abi.encodePacked("maxPerTx"))] = _maxPerTx;
        uintStorage[keccak256(abi.encodePacked("gasPrice"))] = _gasPrice;
        uintStorage[keccak256(abi.encodePacked("requiredBlockConfirmations"))] = _requiredBlockConfirmations;
        bytesStorage[keccak256(abi.encodePacked("homeToForeignMode"))] = DEFRAYAL_MODE;
        bytesStorage[keccak256(abi.encodePacked("foreignToHomeMode"))] = DEFRAYAL_MODE;
        setInitialize(true);
        return isInitialized();
    }

    function getBridgeMode() public pure returns(bytes4 _data) {
        return bytes4(keccak256(abi.encodePacked("arbitrary-message-bridge-core")));
    }

    function setSubsidizedModeForHomeToForeign() public onlyOwner {
        bytesStorage[keccak256(abi.encodePacked("homeToForeignMode"))] = SUBSIDIZED_MODE;
    }

    function setDefrayalModeForHomeToForeign() public onlyOwner {
        bytesStorage[keccak256(abi.encodePacked("homeToForeignMode"))] = DEFRAYAL_MODE;
    }

    function setSubsidizedModeForForeignToHome() public onlyOwner {
        bytesStorage[keccak256(abi.encodePacked("foreignToHomeMode"))] = SUBSIDIZED_MODE;
    }

    function setDefrayalModeForForeignToHome() public onlyOwner {
        bytesStorage[keccak256(abi.encodePacked("foreignToHomeMode"))] = DEFRAYAL_MODE;
    }

    function homeToForeignMode() public view returns(bytes) {
        return bytesStorage[keccak256(abi.encodePacked("homeToForeignMode"))];
    }

    function foreignToHomeMode() public view returns(bytes) {
        return bytesStorage[keccak256(abi.encodePacked("foreignToHomeMode"))];
    }
}
