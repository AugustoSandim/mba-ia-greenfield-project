import { DomainException } from '../../common/exceptions/domain.exception';

export class CommentNotFoundException extends DomainException {
  constructor() {
    super('COMMENT_NOT_FOUND', 404, 'Comment not found');
  }
}
