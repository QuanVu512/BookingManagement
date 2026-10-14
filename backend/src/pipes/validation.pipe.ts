import { PipeTransform, Injectable, ArgumentMetadata } from '@nestjs/common';

@Injectable()
export class CustomValidationPipe implements PipeTransform {
  transform(value: unknown, _metadata: ArgumentMetadata) {
    return value;
  }
}
