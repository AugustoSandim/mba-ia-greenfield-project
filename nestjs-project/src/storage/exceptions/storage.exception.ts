import { DomainException } from '../../common/exceptions/domain.exception';

export class StorageObjectNotFoundException extends DomainException {
  constructor(key?: string) {
    super(
      'STORAGE_OBJECT_NOT_FOUND',
      404,
      key ? `Storage object not found: ${key}` : 'Storage object not found',
    );
  }
}
