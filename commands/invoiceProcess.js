const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const axios = require('axios');

const data = new SlashCommandBuilder()
  .setName('invoice-process')
  .setDescription('Process an invoice')
  .addStringOption((option) => 
    option.setName('id')
      .setDescription('The invoice ID to process')
      .setRequired(true)
  );

async function execute(interaction, client, config) {
  
  await interaction.deferReply({ 
    flags: [MessageFlags.Ephemeral]
  });

  if (
    !config.ALLOWED_USER_IDS.includes(interaction.user.id) &&
    !interaction.member.roles.cache.some(role => config.ALLOWED_ROLE_IDS.includes(role.id))
  ) {
    return interaction.editReply({
      content: config.INVOICE_PROCESS.ERROR_MESSAGES.NO_PERMISSION,
      flags: [MessageFlags.Ephemeral]
    });
  }

  const id = interaction.options.getString('id');
  let invoiceId = id;

  if (invoiceId.includes('-')) {
    invoiceId = invoiceId.split('-').pop();
    invoiceId = invoiceId.replace(/^0+/, '');
  }

  try {
    const response = await axios.get(
      `https://api.sellauth.com/v1/shops/${config.SA_SHOP_ID}/invoices/${invoiceId}/process`,
      {
        headers: {
          Authorization: `Bearer ${config.SA_API_KEY}`,
        },
        validateStatus: function (status) {
          return status < 500;
        }
      }
    );

    if (response.status === 404) {
      return interaction.editReply({ 
        content: config.INVOICE_PROCESS.ERROR_MESSAGES.NO_INVOICE.replace('{invoice_id}', id),
        flags: [MessageFlags.Ephemeral]
      });
    }

    if (response.status === 400) {
      return interaction.editReply({ 
        content: config.INVOICE_PROCESS.ERROR_MESSAGES.ALREADY_PROCESSED,
        flags: [MessageFlags.Ephemeral]
      });
    }

    if (response.status !== 200) {
      return interaction.editReply({ 
        content: config.INVOICE_PROCESS.ERROR_MESSAGES.GENERAL_ERROR,
        flags: [MessageFlags.Ephemeral]
      });
    }

    const embed = new EmbedBuilder()
      .setTitle(config.INVOICE_PROCESS.EMBED.TITLE)
      .setColor(config.INVOICE_PROCESS.EMBED.COLOR)
      .setDescription(config.INVOICE_PROCESS.EMBED.DESCRIPTION.replace('{invoice_id}', id));

    if (config.INVOICE_PROCESS.EMBED.TIMESTAMP) {
      embed.setTimestamp();
    }

    if (config.INVOICE_PROCESS.EMBED.IMAGE_URL) {
      embed.setImage(config.INVOICE_PROCESS.EMBED.IMAGE_URL);
    }

    if (config.INVOICE_PROCESS.EMBED.THUMBNAIL_URL) {
      embed.setThumbnail(config.INVOICE_PROCESS.EMBED.THUMBNAIL_URL);
    }

    await interaction.editReply({ 
      embeds: [embed],
      flags: [MessageFlags.Ephemeral]
    });

  } catch (error) {
    console.error('Error processing invoice:', error);
    await interaction.editReply({ 
      content: config.INVOICE_PROCESS.ERROR_MESSAGES.GENERAL_ERROR,
      flags: [MessageFlags.Ephemeral]
    });
  }
}

module.exports = { data, execute };