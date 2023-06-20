import { Command } from "commander";

export const commander = new Command();

commander
    .option(
        "-c, --config <path>",
        "path to  marketplace configuration JSON file",
        "./marketplace.config.json"
    )
    .parse();