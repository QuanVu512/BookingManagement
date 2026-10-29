import {
  MaxLength,
  IsArray,
  ArrayMaxSize,
  IsOptional,
  IsString,
} from 'class-validator';

export class AiChatHistoryDto {
  @IsString()
  role!: 'user' | 'assistant';

  @IsString()
  @MaxLength(2000)
  content!: string;
}

export class ChatAiRequestDto {
  @IsString()
  @MaxLength(500)
  message!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  history?: AiChatHistoryDto[];
}
