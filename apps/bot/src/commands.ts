import {
  ChannelType,
  SlashCommandBuilder,
  SlashCommandSubcommandBuilder
} from "discord.js";

const textChannel = ChannelType.GuildText;

export const commandBuilders = [
  new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Create the first Rose Ticket setup for this server.")
    .addRoleOption((option) =>
      option.setName("trusted_admin_role").setDescription("Role allowed to manage Rose Ticket.").setRequired(false)
    )
    .addRoleOption((option) => option.setName("staff_role").setDescription("Default support staff role.").setRequired(false))
    .addChannelOption((option) =>
      option
        .setName("pending_ticket_log_channel")
        .setDescription("Channel for pending/open ticket logs.")
        .addChannelTypes(textChannel)
        .setRequired(false)
    )
    .addChannelOption((option) =>
      option
        .setName("closed_ticket_log_channel")
        .setDescription("Channel for closed ticket logs and transcripts.")
        .addChannelTypes(textChannel)
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("panel")
    .setDescription("Create, edit, delete, and send ticket panels.")
    .addSubcommand((sub) =>
      sub
        .setName("create")
        .setDescription("Create a ticket panel with one dropdown option.")
        .addStringOption((option) => option.setName("name").setDescription("Panel name.").setRequired(true))
        .addStringOption((option) => option.setName("title").setDescription("Embed title.").setRequired(true))
        .addStringOption((option) =>
          option.setName("description").setDescription("Embed description.").setRequired(true)
        )
        .addChannelOption((option) =>
          option
            .setName("parent_channel")
            .setDescription("Support channel where private threads will be created.")
            .addChannelTypes(textChannel)
            .setRequired(true)
        )
        .addRoleOption((option) => option.setName("staff_role").setDescription("Staff role for this option.").setRequired(true))
        .addStringOption((option) =>
          option.setName("option_label").setDescription("Dropdown option label.").setRequired(false)
        )
        .addStringOption((option) =>
          option.setName("color").setDescription("Embed color hex, like #22c55e.").setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("edit")
        .setDescription("Open a form to edit a panel.")
        .addStringOption((option) => option.setName("panel_id").setDescription("Panel key or panel name.").setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName("delete")
        .setDescription("Delete a ticket panel.")
        .addStringOption((option) => option.setName("panel_id").setDescription("Panel key or panel name.").setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName("send")
        .setDescription("Send a panel to a channel.")
        .addStringOption((option) => option.setName("panel_id").setDescription("Panel key or panel name.").setRequired(true))
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Channel where the panel should be sent.")
            .addChannelTypes(textChannel)
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("show")
        .setDescription("Show every ticket panel key in this server.")
    ),

  new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("Manage the current Rose Ticket thread.")
    .addSubcommand((sub) => ticketSub(sub, "close", "Close the current ticket.").addStringOption((option) => option.setName("reason").setDescription("Close reason.").setRequired(false)))
    .addSubcommand((sub) => ticketSub(sub, "claim", "Claim the current ticket."))
    .addSubcommand((sub) => ticketSub(sub, "unclaim", "Remove the current ticket claim."))
    .addSubcommand((sub) =>
      ticketSub(sub, "add-user", "Add a user to the current ticket.").addUserOption((option) =>
        option.setName("user").setDescription("User to add.").setRequired(true)
      )
    )
    .addSubcommand((sub) =>
      ticketSub(sub, "remove-user", "Remove a user from the current ticket.").addUserOption((option) =>
        option.setName("user").setDescription("User to remove.").setRequired(true)
      )
    )
    .addSubcommand((sub) =>
      ticketSub(sub, "rename", "Rename the ticket thread.").addStringOption((option) =>
        option.setName("name").setDescription("New thread name.").setRequired(true)
      )
    )
    .addSubcommand((sub) =>
      ticketSub(sub, "priority", "Set ticket priority.").addStringOption((option) =>
        option
          .setName("priority")
          .setDescription("New priority.")
          .setRequired(true)
          .addChoices(
            { name: "Low", value: "low" },
            { name: "Medium", value: "medium" },
            { name: "High", value: "high" },
            { name: "Urgent", value: "urgent" }
          )
      )
    )
    .addSubcommand((sub) => ticketSub(sub, "transcript", "Generate a transcript for the current ticket."))
    .addSubcommand((sub) => ticketSub(sub, "stats", "Show ticket stats for this server.")),

  new SlashCommandBuilder()
    .setName("config")
    .setDescription("Configure Rose Ticket.")
    .addSubcommand((sub) =>
      sub
        .setName("roles")
        .setDescription("Configure core ticket roles.")
        .addRoleOption((option) => option.setName("trusted_admin_role").setDescription("Trusted admin role.").setRequired(false))
        .addRoleOption((option) => option.setName("staff_role").setDescription("Staff role.").setRequired(false))
    )
    .addSubcommand((sub) =>
      sub
        .setName("autoclose")
        .setDescription("Configure inactive ticket auto-close.")
        .addBooleanOption((option) => option.setName("enabled").setDescription("Enable auto-close.").setRequired(true))
        .addIntegerOption((option) =>
          option
            .setName("hours")
            .setDescription("Inactive hours before close.")
            .setMinValue(1)
            .setMaxValue(1440)
            .setRequired(false)
        )
    ),

  new SlashCommandBuilder().setName("help").setDescription("Show Rose Ticket commands and permission info.")
] as const;

function ticketSub(builder: SlashCommandSubcommandBuilder, name: string, description: string) {
  return builder.setName(name).setDescription(description);
}

export const slashCommands = commandBuilders.map((command) => command.toJSON());
