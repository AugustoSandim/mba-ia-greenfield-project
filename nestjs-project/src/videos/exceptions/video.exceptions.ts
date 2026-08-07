import { DomainException } from '../../common/exceptions/domain.exception';

export class VideoNotFoundException extends DomainException {
  constructor() {
    super('VIDEO_NOT_FOUND', 404, 'Video not found');
  }
}

export class VideoOwnershipException extends DomainException {
  constructor() {
    super('VIDEO_OWNERSHIP_REQUIRED', 403, 'You do not own this video');
  }
}

export class VideoNotInDraftException extends DomainException {
  constructor() {
    super('VIDEO_NOT_IN_DRAFT', 422, 'Video is not in draft status');
  }
}

export class VideoNotReadyException extends DomainException {
  constructor() {
    super('VIDEO_NOT_READY', 422, 'Video is not ready for playback');
  }
}
