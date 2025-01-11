const { Client, GatewayIntentBits, REST, Routes, Collection } = require('discord.js');
const { readFileSync, readdirSync } = require('fs');
const yaml = require('yaml');
const path = require('path');

const configPath = path.join(process.cwd(), 'config.yml');
const config = yaml.parse(readFileSync(configPath, 'utf-8'));

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

const rest = new REST({ version: '10' }).setToken(config.BOT_TOKEN);

client.commands = new Collection();

const commandsPath = path.join(process.cwd(), 'commands');
const commandFiles = readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  
  if ('data' in command && 'execute' in command) {
    client.commands.set(command.data.name, command);
  } else {
    console.log(`[WARNING] The command at ${filePath} is missing required "data" or "execute" property.`);
  }
}

async function deployCommands() {
  try {
    console.log('Started refreshing application (/) commands.');

    const commands = Array.from(client.commands.values()).map(command => command.data.toJSON());

    await rest.put(
      Routes.applicationGuildCommands(config.CLIENT_ID, config.GUILD_ID),
      { body: commands }
    );

    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error('Error registering commands:', error);
  }
}

deployCommands();

client.once('ready', () => {
  console.log(`${client.user.tag} is online!`);
});

client.on('interactionCreate', async (interaction) => {
  if (interaction.isChatInputCommand()) {
    const command = client.commands.get(interaction.commandName);

    if (!command) {
      console.error(`No command matching ${interaction.commandName} was found.`);
      return;
    }

    try {
      await command.execute(interaction, client, config);
    } catch (error) {
      console.error(error);
      await interaction.reply({
        content: 'There was an error executing this command!',
        ephemeral: true
      });
    }
  } else if (interaction.isButton() || interaction.isStringSelectMenu()) {
    for (const command of client.commands.values()) {
      if (command.handleInteraction) {
        try {
          await command.handleInteraction(interaction, config);
          break;
        } catch (error) {
          console.error('Error handling interaction:', error);
        }
      }
    }
  }
});

client.login(config.BOT_TOKEN);