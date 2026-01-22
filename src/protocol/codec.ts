import { encode, decode } from '@msgpack/msgpack';
import type { Message } from '../types';

/**
 * MessagePack codec for encoding/decoding JACK messages.
 * Binary format is 2-4x faster than JSON and ~30% smaller.
 */
export class Codec {
  /**
   * Encode a message to MessagePack binary format.
   */
  encode(message: Message): Uint8Array {
    return encode(message);
  }

  /**
   * Decode a MessagePack binary to a Message.
   * @throws if the data is not valid MessagePack
   */
  decode(data: Uint8Array): Message {
    const decoded = decode(data);
    return decoded as Message;
  }
}
