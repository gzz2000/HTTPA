
class DupInputError extends Error {}
class ControlledTerminate extends Error {}
class VerificationError extends Error {}

module.exports = {
  DupInputError,
  ControlledTerminate,
  VerificationError
};
