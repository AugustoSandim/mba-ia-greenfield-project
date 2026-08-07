import { DomainException } from '../../common/exceptions/domain.exception';

export class ChannelByNicknameNotFoundException extends DomainException {
  constructor() {
    super('CHANNEL_NOT_FOUND', 404, 'Channel not found');
  }
}

export class ChannelNicknameTakenException extends DomainException {
  constructor() {
    super('CHANNEL_NICKNAME_TAKEN', 409, 'Nickname is already taken');
  }
}

export class VideoNotPublishedException extends DomainException {
  constructor() {
    super('VIDEO_NOT_PUBLISHED', 422, 'Video is not published');
  }
}

export class VideoNotReadyForPublishException extends DomainException {
  constructor() {
    super('VIDEO_NOT_READY', 422, 'Video must be ready before publishing');
  }
}
