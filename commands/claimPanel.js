const { 
  SlashCommandBuilder, 
  EmbedBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  ActionRowBuilder, 
  ModalBuilder, 
  TextInputBuilder, 
  TextInputStyle,
  MessageFlags 
} = require('discord.js');
const { writeFileSync, existsSync, readFileSync } = require('fs');
const path = require('path');
const axios = require('axios');

const claimsFilePath = path.join(process.cwd(), 'claims.json');
let claimsData = {};

if (existsSync(claimsFilePath)) {
  claimsData = JSON.parse(readFileSync(claimsFilePath, 'utf-8'));
} else {
  writeFileSync(claimsFilePath, JSON.stringify(claimsData));
}

const data = new SlashCommandBuilder()
  .setName('claimpanel')
  .setDescription('Create a persistent claim panel (Admin only)');

async function execute(interaction, client, config) {
  if (
    !config.ALLOWED_USER_IDS.includes(interaction.user.id) &&
    !interaction.member.roles.cache.some(role => config.ALLOWED_ROLE_IDS.includes(role.id))
  ) {
    return interaction.reply({
      content: config.CLAIM_PANEL.ERROR_MESSAGES.NO_PERMISSION,
      flags: [MessageFlags.Ephemeral]
    });
  }

  const channel = client.channels.cache.get(config.TARGET_CHANNEL_ID);
  if (!channel) {
    return interaction.reply({
      content: config.CLAIM_PANEL.ERROR_MESSAGES.CHANNEL_NOT_FOUND,
      flags: [MessageFlags.Ephemeral]
    });
  }

  const embedDescription = `${config.CLAIM_PANEL.DESCRIPTION}\n\n**Example Invoice ID:** \`\`${config.CLAIM_PANEL.EXAMPLE_INVOICE_ID}\`\``;

  const embed = new EmbedBuilder()
    .setTitle(config.CLAIM_PANEL.TITLE)
    .setDescription(embedDescription)
    .setColor(config.CLAIM_PANEL.COLOR);

  if (config.CLAIM_PANEL.THUMBNAIL_URL && config.CLAIM_PANEL.THUMBNAIL_URL.trim() !== '') {
    embed.setThumbnail(config.CLAIM_PANEL.THUMBNAIL_URL);
  }

  if (config.CLAIM_PANEL.IMAGE_URL && config.CLAIM_PANEL.IMAGE_URL.trim() !== '') {
    embed.setImage(config.CLAIM_PANEL.IMAGE_URL);
  }

  const button = new ButtonBuilder()
    .setCustomId('claim_button')
    .setLabel(config.CLAIM_PANEL.BUTTON_LABEL)
    .setStyle(ButtonStyle.Primary);

  const row = new ActionRowBuilder().addComponents(button);

  await channel.send({ embeds: [embed], components: [row] });
  await interaction.reply({ 
    content: config.CLAIM_PANEL.SUCCESS_MESSAGE, 
    flags: [MessageFlags.Ephemeral]
  });
}

async function handleInteraction(interaction, config) {
  if (interaction.isButton() && interaction.customId === 'claim_button') {
    const modal = new ModalBuilder()
      .setCustomId('claim_modal')
      .setTitle(config.CLAIM_PANEL.MODAL_TITLE);

    const emailInput = new TextInputBuilder()
      .setCustomId('email')
      .setLabel(config.CLAIM_PANEL.EMAIL_LABEL)
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const invoiceInput = new TextInputBuilder()
      .setCustomId('invoice_id')
      .setLabel(config.CLAIM_PANEL.INVOICE_LABEL)
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const emailRow = new ActionRowBuilder().addComponents(emailInput);
    const invoiceRow = new ActionRowBuilder().addComponents(invoiceInput);

    modal.addComponents(emailRow, invoiceRow);
    await interaction.showModal(modal);
  } else if (interaction.isModalSubmit() && interaction.customId === 'claim_modal') {
    const userEmail = interaction.fields.getTextInputValue('email');
    let invoiceId = interaction.fields.getTextInputValue('invoice_id');

    invoiceId = invoiceId.includes('-') ? invoiceId.split('-').pop() : invoiceId;
    invoiceId = invoiceId.replace(/^0+/, '');

    if (claimsData[invoiceId]) {
      return interaction.reply({
        content: config.CLAIM_PANEL.ERROR_MESSAGES.INVOICE_CLAIMED.replace('{invoiceId}', invoiceId),
        flags: [MessageFlags.Ephemeral]
      });
    }

    try {
      const response = await axios.get(
        `https://api.sellauth.com/v1/shops/${config.SA_SHOP_ID}/invoices/${invoiceId}`,
        {
          headers: {
            Authorization: `Bearer ${config.SA_API_KEY}`,
          },
        }
      );

      const invoiceData = response.data;

      if (invoiceData.email !== userEmail) {
        return interaction.reply({
          content: config.CLAIM_PANEL.ERROR_MESSAGES.EMAIL_MISMATCH,
          flags: [MessageFlags.Ephemeral]
        });
      }

      if (invoiceData.completed_at) {
        const customerRole = interaction.guild.roles.cache.get(config.BOT_CUSTOMER_ROLE_ID);
        if (customerRole) {
          await interaction.member.roles.add(customerRole);
        }

        claimsData[invoiceId] = interaction.user.id;
        writeFileSync(claimsFilePath, JSON.stringify(claimsData, null, 2));

        return interaction.reply({
          content: config.CLAIM_PANEL.SUCCESS_MESSAGES.ROLE_CLAIMED.replace('{invoiceId}', invoiceId),
          flags: [MessageFlags.Ephemeral]
        });
      } else {
        return interaction.reply({
          content: config.CLAIM_PANEL.ERROR_MESSAGES.INVOICE_UNPAID.replace('{invoiceId}', invoiceId),
          flags: [MessageFlags.Ephemeral]
        });
      }
    } catch (error) {
      console.error('Error processing claim:', error);
      return interaction.reply({
        content: config.CLAIM_PANEL.ERROR_MESSAGES.GENERAL_ERROR,
        flags: [MessageFlags.Ephemeral]
      });
    }
  }
}

module.exports = { data, execute, handleInteraction };