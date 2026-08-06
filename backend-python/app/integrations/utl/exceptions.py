class UTLBaseError(Exception):
    """Base exception for UTL integration errors."""


class UTLRequestError(UTLBaseError):
    """Raised when a request to the UTL API fails."""
