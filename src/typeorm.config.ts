import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { DefaultNamingStrategy, NamingStrategyInterface } from 'typeorm';

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

export const typeOrmConfigFactory = (
  config: ConfigService,
): TypeOrmModuleOptions => ({
  type: 'postgres',
  host: config.get<string>('database.host'),
  port: config.get<number>('database.port'),
  username: config.get<string>('database.username'),
  password: config.get<string>('database.password'),
  database: config.get<string>('database.name'),
  autoLoadEntities: true,
  synchronize: true,
  namingStrategy: new SnakeNamingStrategy(),
});
