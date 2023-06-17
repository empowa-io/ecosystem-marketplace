
const tokenNameStr = process.argv[2] ?? "";

console.log(
    `\n"${
        Buffer.from(
            tokenNameStr,
            "utf-8" 
        ).toString("hex")
    }"\n`
);