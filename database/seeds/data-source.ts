import 'dotenv/config';
import { DataSource, DefaultNamingStrategy, NamingStrategyInterface } from 'typeorm';
import { UserEntity } from '../../src/shared/entities/user.entity';
import { RefreshTokenEntity } from '../../src/auth/infrastructure/entities/refresh-token.entity';
import { PasswordResetTokenEntity } from '../../src/auth/infrastructure/entities/password-reset-token.entity';
import { ClassroomEntity } from '../../src/classroom/infrastructure/entities/classroom.entity';
import { StudentEntity } from '../../src/student/infrastructure/entities/student.entity';

const toSnake = (str: string) =>
  str
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/([a-z\d])([A-Z])/g, '$1_$2')
    .toLowerCase();

class SnakeNamingStrategy
  extends DefaultNamingStrategy
  implements NamingStrategyInterface
{
  tableName(targetName: string, userSpecified: string | undefined): string {
    return userSpecified ?? toSnake(targetName);
  }

  columnName(
    propertyName: string,
    customName: string | undefined,
    embeddedPrefixes: string[],
  ): string {
    return (
      embeddedPrefixes.map(toSnake).join('_') +
      (customName ?? toSnake(propertyName))
    );
  }

  relationName(propertyName: string): string {
    return toSnake(propertyName);
  }

  joinColumnName(relationName: string, referencedColumnName: string): string {
    return toSnake(`${relationName}_${referencedColumnName}`);
  }

  joinTableName(
    firstTableName: string,
    secondTableName: string,
    firstPropertyName: string,
  ): string {
    return toSnake(
      `${firstTableName}_${firstPropertyName.replace(/\./g, '_')}_${secondTableName}`,
    );
  }

  joinTableColumnName(
    tableName: string,
    propertyName: string,
    columnName?: string,
  ): string {
    return toSnake(`${tableName}_${columnName ?? propertyName}`);
  }

  classTableInheritanceParentColumnName(
    parentTableName: string,
    parentTableIdPropertyName: string,
  ): string {
    return toSnake(`${parentTableName}_${parentTableIdPropertyName}`);
  }
}

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USER ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'postgres',
  database: process.env.DB_NAME ?? 'attendance',
  entities: [UserEntity, RefreshTokenEntity, PasswordResetTokenEntity, ClassroomEntity, StudentEntity],
  namingStrategy: new SnakeNamingStrategy(),
  synchronize: false,
});
