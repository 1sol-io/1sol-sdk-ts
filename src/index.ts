import { Connection } from "@solana/web3.js";

interface configProps {

}

const defaultConfig = {}

export class OnesolProtocol {
  constructor(private connection: Connection, private config: configProps = defaultConfig) {
    this.connection = connection;

    this.config = config
  }
}
