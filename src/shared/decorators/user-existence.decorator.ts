import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { Repository } from 'typeorm';
import { UserEntity } from '../entities/user.entity';

@ValidatorConstraint({ name: 'UserExistence', async: true })
@Injectable()
export class UserExistenceValidator implements ValidatorConstraintInterface {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
  ) {}

  async validate(userId: unknown): Promise<boolean> {
    if (typeof userId !== 'string' || userId.length === 0) {
      return false;
    }
    return (await this.userRepository.countBy({ id: userId })) > 0;
  }

  defaultMessage(args: ValidationArguments): string {
    return `User "${String(args.value)}" does not exist`;
  }
}

export function UserExistenceValidate(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return (target: object, propertyName: string | symbol) => {
    registerDecorator({
      target: target.constructor,
      propertyName: propertyName as string,
      options: validationOptions,
      constraints: [],
      validator: UserExistenceValidator,
    });
  };
}
